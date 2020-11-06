<template>
  <div>
    <h1>Video Conference Playground</h1>
    <p>isUserMutedMap: {{ isUserMutedMap }}</p>
    <p>isUserCameraOnMap: {{ isUserCameraOnMap }}</p>
    <p>isUserSharingScreenMap: {{ isUserSharingScreenMap }}</p>
    <p>dominantSpeakerID: {{ dominantSpeakerID }}</p>

    <button @click="toggleMic()">Toggle mute</button>
    <!-- the `:disabled` property below is necessary to respect Jitsi's limitation: only one video feed can be shared per user -->
    <button @click="toggleCamera()" :disabled="localScreenTrack">Toggle camera</button>
    <button @click="toggleScreen()" :disabled="localCameraTrack">Toggle screen-share</button>
    <button @click="unload()">Hang up</button>

    <div id="myLocalTracks">

    </div>

    <div id="remoteVideoTracks">

    </div>

    <div id="remoteAudioTracks">

    </div>
  </div>
</template>

<script>
/**
 * Built upon the lib-jisti-meet API, this a minimalistic video conference room that supports basic functionalities such as mute/unmute, video share/unshare, screenshare
 * and the ability to detect the dominant speaker. 
 * 
 * @see https://github.com/jitsi/lib-jitsi-meet/blob/master/doc/API.md
 * @see // TODO: create a documentation  page on GitHub with links to Explain videos
 * @see Specific Track API: https://github.com/jitsi/lib-jitsi-meet/blob/master/doc/API.md#jitsitrack
 *
 * KNOWN ISSUES: 
 *   - Errors are not explicitly handled (e.g. no popup is shown)
 *   - The dominant speaker event is sometimes not very accurate or responsive
 * 
 * Misleading behaviors of Jitsi: 
 *    - Autoplay for Safari is disabled unless the user touched something, which is why having audio only by default is a great work-around for all browsers
 *    - Cannot share more than one video source at a time: you must deactivate your camera track if you want to share your screen track
 * 
 * Reliability and quality concerns:
 *   Even though there is no guarantee on the reliability of Jitsi over the years,
 *   I trust it for the near future because Professor Erik Demaine trusts it with his project.
 *   After testing, audio quality is surprisingly good. Because Jitsi Meet relies uses lib-jitsi-meet, the quality will be matched. 
 */
import { initConfigStandard, getConnectionConfigNikita, conferenceConfigStandard } from "@/JitsiConfigs.js"; 

export default {
  name: "VideoConferenceRoom",
  data () {
    return {
      jitsiConnector: null,
      conferenceRoom: null,

      localMicTrack: null,
      localCameraTrack: null,
      localScreenTrack: null,
     
      isUserMutedMap: {}, // maps userID to whether he/she is muted 
      isUserCameraOnMap: {}, // maps userID to whether his/her camera is on 
      isUserSharingScreenMap: {},

      dominantSpeakerID: "", // AF("") -> nobody is the dominant speaker 
      remoteTracks: {} // useful for knowing which tracks to remove when a remote user leaves
    };
  },
  computed: {
    myID () { return this.conferenceRoom.myUserId() }
  },
  created () {
    // step 1/4: initialize the global `JitsiMeetJS` object 
    JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR); // without this line, the console will be overwhelmed
    JitsiMeetJS.init(initConfigStandard); 

    // step 2/4: initalize a `Connection` object
    this.jitsiConnector = new JitsiMeetJS.JitsiConnection(null, null, getConnectionConfigNikita("put-room-id-here"));
    const { CONNECTION_ESTABLISHED, CONNECTION_FAILED, CONNECTION_DISCONNECTED } = JitsiMeetJS.events.connection;
    this.jitsiConnector.addEventListener(CONNECTION_ESTABLISHED, this.onConnectionSuccess);
    this.jitsiConnector.addEventListener(CONNECTION_FAILED, (e) => console.error("Connection failed, error =", e)); // can display an explicit error popup
    const removeJitsiConnectorEventListeners = () => {
      const { CONNECTION_ESTABLISHED, CONNECTION_FAILED, CONNECTION_DISCONNECTED } = JitsiMeetJS.events.connection; 
      this.jitsiConnector.removeEventListener(CONNECTION_ESTABLISHED, this.onConnectionSuccess);
      this.jitsiConnector.removeEventListener(CONNECTION_FAILED, (e) => console.error("Connection failed, error =", e)); // can display an explicit error popup 
      this.jitsiConnector.removeEventListener(CONNECTION_DISCONNECTED, removeJitsiConnectorEventListeners);
    }
    this.jitsiConnector.addEventListener(CONNECTION_DISCONNECTED, removeJitsiConnectorEventListeners);
   
    // step 3/4 .connect() does *not* return a promise, so the callback is defined in `room.on(...CONFERENCE_JOINED, callback)`
    this.jitsiConnector.connect(); 

    // step 4/4: make sure everything will be cleaned-up properly when destroyed
    $(window).bind("beforeunload", this.unload);
    $(window).bind("unload", this.unload);
  },
  beforeDestroy () {
    this.disposeTracksAndDisconnectFromConference();
  },
  methods: {
    onConnectionSuccess () {
      this.conferenceRoom = this.jitsiConnector.initJitsiConference("conference", conferenceConfigStandard); // I assume `initJitsiConference` just joins the conference if it exists already
      
      // this line below resolves a lib-jitsi-meet bug that I spent 3 days debugging: https://github.com/jitsi/lib-jitsi-meet/issues/1333#issuecomment-711107368
      this.conferenceRoom.setSenderVideoConstraint(150);

      // we now handle these following events: 
      const { 
        CONFERENCE_JOINED,
        TRACK_ADDED, 
        TRACK_REMOVED,
        USER_JOINED,
        DOMINANT_SPEAKER_CHANGED,
        TRACK_MUTE_CHANGED,
        USER_LEFT } = JitsiMeetJS.events.conference;

      const initUserMetadata = (userID) => {
        this.$set(this.isUserMutedMap, userID, false);
        this.$set(this.isUserCameraOnMap, userID, false);
        this.$set(this.isUserSharingScreenMap, userID, false); 
        this.$set(this.remoteTracks, userID, []);
      }

      const uninitUserMetadata = (userID) => {
        this.$delete(this.isUserMutedMap, userID); 
        this.$delete(this.isUserCameraOnMap, userID); 
        this.$delete(this.isUserSharingScreenMap, userID); 
        this.$delete(this.remoteTracks, userID);
      }

      this.conferenceRoom.on(CONFERENCE_JOINED, async () => {
        initUserMetadata(this.myID); 
        const myLocalTracks = await JitsiMeetJS.createLocalTracks({ devices: ["audio"] }); 
        for (const track of myLocalTracks) {
          this.conferenceRoom.addTrack(track);
          switch (track.getType()) {
            case "audio": 
              this.localMicTrack = track; 
              this.$set(this.isUserMutedMap, this.myID, track.isMuted());
              break; 
            case "video": 
              // TODO: handle the screen and camera differently
              this.handleMyNewCameraTrack(track); 
              break; 
          }
        }
      });
    
      this.conferenceRoom.on(TRACK_ADDED, async (track) => {
        if (track.isLocal()) return; // TODO: re-write: participantID = myUserId()
        
        const userID = track.getParticipantId(); 
        const trackID = userID + track.getType();
        if (track.getType() === 'video') {
          $("#remoteVideoTracks").append(`<video autoplay="true" id="${trackID}" style="width: 300px; height: 300px"/>`);
          this.$set(this.isUserCameraOnMap, userID, true); 
        } else {
          $("#remoteAudioTracks").append(`<audio autoplay="true" id="${trackID}"/>`);
          this.$set(this.isUserMutedMap, userID, track.isMuted()); // unlike video, an added audio track can be muted/unmuted
        }
        track.attach($(`#${trackID}`)[0]);
        this.remoteTracks[userID].push(track);  // WARNING: if USER_JOINED is not always executed before TRACK_ADDED, then remoteTracks[userID] can be undefined.
                                                // Moreover, this operation is probabably not reactive. 
      });

      // tracks can be removed even if the user didn't leave. 
      // For example, the user can toggle their camera/screen on/off
      this.conferenceRoom.on(TRACK_REMOVED, (track) => {
        if (track.isLocal()) return; 

        const htmlElement = document.getElementById(track.getParticipantId() + track.getType());
        if (htmlElement) htmlElement.remove();  
        if (track.getType() === "video") {
          // TODO: handle the difference between the screen and the video
          this.$set(this.isUserCameraOnMap, track.getParticipantId(), false); 
        }
        // note that there is no need to handle audio because that means the user left the conference altogether,
        // so the metadata will be already handled by "USER_LEFT"  
      })

      // note USER_JOINED is only fired for other users and not ourselves
      this.conferenceRoom.on(USER_JOINED, (userID) => { 
        initUserMetadata(userID); 
      });

      this.conferenceRoom.on(USER_LEFT, (userID) => {        
        for (const track of this.remoteTracks[userID]) {
          const htmlElement = document.getElementById(userID + track.getType());
          if (htmlElement) {
            track.detach(htmlElement); // `detach` the data stream/track i.e. can think of it *like* a `src` attribute 
            htmlElement.remove(); // remove the element itself
          }
        } 
        uninitUserMetaData(userID); 
      });

      this.conferenceRoom.on(DOMINANT_SPEAKER_CHANGED, (userID) => 
        this.dominantSpeakerID = userID
      );
      
      // muted tracks will already have no sound, but we still have maintain the rep invariant
      this.conferenceRoom.on(TRACK_MUTE_CHANGED, (track) => 
        this.$set(this.isUserMutedMap, track.getParticipantId(), track.isMuted())
      );

      // finally join the room 
      this.conferenceRoom.join();
    },
    async toggleMic () {
      if (this.isUserMutedMap[this.myID]) {
        await this.localMicTrack.unmute(); 
      } else {
        await this.localMicTrack.mute();  
      }
      this.$set(this.isUserMutedMap, this.myID, this.localMicTrack.isMuted()); 
    },
    /**
     * This method assumes, as a pre-condition, that the user has already connected to `Conference`.
     * This pre-condition is satisfied because the camera button is displayed only after the user has connected.
     */
    async toggleCamera () {
      if (! this.isUserCameraOnMap[this.myID]) {
        const [ cameraTrack ] = await JitsiMeetJS.createLocalTracks({
          devices: ["video"]
        });
        this.conferenceRoom.addTrack(cameraTrack);
        this.handleMyNewCameraTrack(cameraTrack);
      } 
      else {
        await this.localCameraTrack.dispose(); 
        $("#myLocalCameraTrack").remove(); // NOTE: if .remove() is called before .dispose() resolves, then the camera light remains on
        this.localCameraTrack = null; 
        this.$set(this.isUserCameraOnMap, this.myID, false); 
      }
    },
    handleMyNewCameraTrack (cameraTrack) {
      // maintain rep
      this.localCameraTrack = cameraTrack; 
      this.$set(this.isUserCameraOnMap, this.myID, true); 

      // handle DOM 
      $('#myLocalTracks').append(
        `<video autoplay="true" id="myLocalCameraTrack" style="width: 300px; height: 300px;"/>`
      );
      cameraTrack.attach($("#myLocalCameraTrack")[0]);
    },
    async toggleScreen () {
      if (! this.isUserSharingScreenMap[this.myID]) {
         const [ screenTrack ] = await JitsiMeetJS.createLocalTracks({
          devices: ["desktop"]
        });

        $("#myLocalTracks").append(`
          <video autoplay="true" id="myLocalScreen" style="height: 300px; width: 300px;"/> 
        `); 
        screenTrack.attach($("#myLocalScreen")[0]);
        this.conferenceRoom.addTrack(screenTrack); 

        // maintain the rep invariant
        this.$set(this.isUserSharingScreenMap, this.myID, true); 
        this.localScreenTrack = screenTrack; 
      }
      else {
        await this.localScreenTrack.dispose(); 
        $("#myLocalScreen").remove(); 
        this.localScreenTrack = null; 
        this.$set(this.isUserSharingScreenMap, this.myID, false); 
      }
    },
    unload () {
      this.disposeTracksAndDisconnectFromConference();
    },  
    disposeTracksAndDisconnectFromConference () {
      if (this.localMicTrack) this.localMicTrack.dispose(); 
      if (this.localCameraTrack) this.localCameraTrack.dispose(); 
      this.conferenceRoom.leave();
      this.jitsiConnector.disconnect();
    }
  }
};
</script>
