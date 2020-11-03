<template>
  <div>
    <h1>Video Conference Playground</h1>
    <p>isUserMutedMap: {{ isUserMutedMap }}</p>
    <p>isUserCameraOnMap: {{ isUserCameraOnMap }}</p>
    <p>dominantSpeakerID: {{ dominantSpeakerID }}</p>

    <button @click="toggleMic()">Toggle mute</button>
    <button @click="toggleCamera()">Toggle camera</button>
    <button @click="toggleScreen()">Toggle screen-share</button>
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
 * Built upon the lib-jisti-meet API, thiis is an audio conference room that supports basic functionalities such as mute/unmute, video share/unshare, screenshare
 * and the ability to detect the dominant speaker. 
 * 
 * TODO: create a documentation page on Github with links to Explain videos
 * Connection: used to create conference rooms
 * 
 * @see Overall API: https://github.com/jitsi/lib-jitsi-meet/blob/master/doc/API.md
 * @see Specific Track API: https://github.com/jitsi/lib-jitsi-meet/blob/master/doc/API.md#jitsitrack
 * 
 * CRITICAL ISSUES
 *   Duplicate tracks are shared sometimes
 *   The dominant speaker event is sometimes not very accurate or responsive
 *   Display errors explicitly with a popup rather than with an implicit console error e.g. video source error 
 * 
 *   Video related issues (currently ignored) 
 *      - Even if the video track is correctly added, it's not actually carrying any data
 *      - when screenshare is stopped, the DOM element must be removed (there needs to be an event listener for when the track is stopped/disabled)
 * 
 * Caveats: 
 *    Video sharing only works when calling ["audio", "video"], cannot currently get it working for some reason if it's just audio by default
 *    and the ability to turn on camera.
 *    Cannot share more than one video source at a time: you must deactivate your camera track if you want to share your screen track
 *    Repeated calls to the same "Jitsi.createLocalTracks" does not prompt the screen capture again
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
    this.jitsiConnector.addEventListener(CONNECTION_FAILED, this.onConnectionFailed);
    this.jitsiConnector.addEventListener(CONNECTION_DISCONNECTED, this.onDisconnect);
   
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
      
      // we now handle these following events: 
      const { 
        CONFERENCE_JOINED,
        TRACK_ADDED, 
        TRACK_REMOVED,
        USER_JOINED,
        DOMINANT_SPEAKER_CHANGED,
        TRACK_MUTE_CHANGED,
        USER_LEFT } = JitsiMeetJS.events.conference;

      this.conferenceRoom.on(CONFERENCE_JOINED, async () => {
        const myLocalTracks = await JitsiMeetJS.createLocalTracks({ devices: ["audio", "video"] }); 
        console.log("myLocalTracks =", myLocalTracks); 
        for (const track of myLocalTracks) {
          switch (track.getType()) {
            case "audio": 
              this.localMicTrack = track; 
              break; 
            case "video": 
              this.localCameraTrack = track; 
              $('#myLocalTracks').append(
                `<video autoplay="true" id="myLocalCameraTrack" style="width: 300px; height: 300px;"/>`
              );
              track.attach($("#myLocalCameraTrack")[0]);
              break; 
          }
          this.conferenceRoom.addTrack(track);
        }
        // initialize rep TODO: depending on the "audio", "video" parameter
        this.$set(this.isUserMutedMap, this.myID, false); // TODO: a user could also be muted initially, so the boolean value should not always be false 
        this.$set(this.isUserCameraOnMap, this.myID, true); 
      });
      
      this.conferenceRoom.on(TRACK_ADDED, async (track) => {
        console.log("new track, type =", track.getType());
        if (track.isLocal()) { // TODO: re-write: participantID = myUserId()
          console.log("track is from myself =", track);
          return;
        }
        console.log("track is from someone else =", track);

        // step 1/3: mount to DOM (TODO: use a switch statement?)
        const participantID = track.getParticipantId();
        const trackID = participantID + track.getType();
        if (track.getType() === 'video') {
          $("#remoteVideoTracks").append(`<video autoplay="true" id="${trackID}" style="width: 300px; height: 300px"/>`);
        } else {
          $("#remoteAudioTracks").append(`<audio autoplay="true" id="${trackID}"/>`);
        }

        // step 2/3: attach the stream/track
        track.attach($(`#${trackID}`)[0]);

        // step 3/3: maintain the rep invariant
        if (!this.remoteTracks[participantID]) {
          this.$set(this.remoteTracks, participantID, []);
        }
        this.remoteTracks[participantID].push(track); // WARNING: this operation is probably undetectable and therefore unreactive
      });

      // tracks can be removed even if the user didn't leave. 
      // For example, a screen-share session can be turned on and off.
      this.conferenceRoom.on(TRACK_REMOVED, (track) => {
        const htmlElement = document.getElementById(track.getParticipantId() + track.getType());
        if (htmlElement) htmlElement.remove(); 
      })

      // note USER_JOINED is only fired for other users and not ourselves
      this.conferenceRoom.on(USER_JOINED, (userID) => { 
        this.$set(this.isUserMutedMap, userID, false);
        this.$set(this.remoteTracks, userID, []);
      });

      this.conferenceRoom.on(USER_LEFT, (userID) => {
        // maintain the rep invariant
        delete this.isUserMutedMap[userID]; 
        
        // clean up the tracks he/she shared
        // TODO: also remove the <p> tags with the labels, otherwise the UI looks like it didn't update correctly
        // FIXME: the detach() function throws errors, potentially related to https://github.com/jitsi/lib-jitsi-meet/issues/859
        
        // temporarily comment out for debugging purposes
        for (const track of this.remoteTracks[userID]) {
          console.log(`removing ${this.remoteTracks[userID].length} tracks`);
          const htmlElement = document.getElementById(userID + track.getType());
          track.detach(htmlElement); // `detach` the data stream/track i.e. the src attribute 
          htmlElement.remove(); // remove the element itself
        }
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
        $("#myLocalTracks").append(`
          <video autoplay="true" id="myLocalCameraTrack" style="height: 300px; width: 300px"/>
        `);
        cameraTrack.attach($("#myLocalCameraTrack")[0]); // why is there a [0] in here?
        this.conferenceRoom.addTrack(cameraTrack);

        // maintain the rep invariant
        this.$set(this.isUserCameraOnMap, this.myID, true); 
        this.localCameraTrack = cameraTrack; 
      }
    
      else {
        $("#myLocalCameraTrack").remove(); 
        // document.getElementById("myLocalCameraTrack").remove(); 
        this.localCameraTrack.dispose();
        this.isUserCameraOnMap[this.myID] = false; 
      }
    },
    async toggleScreen () {
      if (! this.isUserSharingScreenMap[this.myID]) {
         const [ screenTrack ] = await JitsiMeetJS.createLocalTracks({
          devices: ["desktop"]
        });
        $("#remoteVideoTracks").append(`
          <video autoplay="true" id="myLocalScreen" style="height: 200px; width: 400px;"/> 
        `); 
        screenTrack.attach($("#myLocalScreen")[0]);
        this.conferenceRoom.addTrack(screenTrack); 

        // maintain the rep invariant
        this.$set(this.isUserSharingScreenMap, this.myID, true); 
        this.localScreenTrack = screenTrack; 
      }

      else {
        $("#myLocalScreen").remove(); 
        this.localScreenTrack.dispose(); 
        this.isUserSharingScreenMap[this.myID] = false; 
      }
    },
    onDisconnect () {
      console.log("onDisconnect()");
      const { CONNECTION_ESTABLISHED, CONNECTION_FAILED, CONNECTION_DISCONNECTED } = JitsiMeetJS.events.connection; 
      this.jitsiConnector.removeEventListener(CONNECTION_ESTABLISHED, this.onConnectionSuccess);
      this.jitsiConnector.removeEventListener(CONNECTION_FAILED, this.onConnectionFailed);
      this.jitsiConnector.removeEventListener(CONNECTION_DISCONNECTED, this.onDisconnect);
    },
    unload () {
      this.disposeTracksAndDisconnectFromConference();
    },  
    disposeTracksAndDisconnectFromConference () {
      if (this.localMicTrack) this.localMicTrack.dispose(); 
      if (this.localCameraTrack) this.localCameraTrack.dispose(); 
      this.conferenceRoom.leave();
      this.jitsiConnector.disconnect();
    },
    // TODO: display an error popup message
    onConnectionFailed (e) {
      console.error("Connection Failed e =", e);
    }
  }
};
</script>
