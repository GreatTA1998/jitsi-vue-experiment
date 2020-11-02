<template>
  <div>
    <h1>AUDIO CONFERENCE PLAYGROUND</h1>
    <p>isUserMutedMap: {{ isUserMutedMap }}</p>
    <p>dominantSpeakerID: {{ dominantSpeakerID }}</p>

    <button @click="toggleMic()">Toggle mute</button>
    <!-- <button @click="toggleCamera()">Toggle camera</button> -->
    <button @click="unload()">Hang up</button>

    <div id="myLocalTracks">

    </div>

    <div id="remoteVideoTracks">

    </div>

    <div id="remoteAudioTracks">

    </div>

    <div id="audioOutputSelectWrapper" style="display: none;">
      Change audio output device
      <!-- <select id="audioOutputSelect" onchange="changeAudioOutput(this)"></select> -->
      <select id="audioOutputSelect" @change="changeAudioOutput($event.target.value)"></select>
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
 * 
 *   Video related issues (currently ignored) 
 *      - Even if the video track is correctly added, it's not actually carrying any data
 * 
 * Reliability and quality concerns:
 *   Even though there is no guarantee on the reliability of Jitsi over the years,
 *   I trust it for the near future because Professor Erik Demaine trusts it with his project.
 *   After testing, audio quality is surprisingly good. Because Jitsi Meet relies uses lib-jitsi-meet, the quality will be matched. 
 */
import { initConfigStandard, getConnectionConfigNikita, conferenceConfigStandard } from "@/JitsiConfigs.js"; 

export default {
  name: "JitsiAudioConferenceRoom",
  data () {
    return {
      jitsiConnector: null,
      conferenceRoom: null,
      localMicTrack: null,
      dominantSpeakerID: "", // AF("") -> nobody is the dominant speaker 
      isUserMutedMap: {}, // maps userID to whether he/she is muted 
      remoteTracks: {} // useful for knowing which tracks to remove when a remote user leaves
      // localCameraTrack: null,
      // isCameraOn: false,
    };
  },
  created () {
    // step 1/4: initialize the global JitsiMeetObject and jitsi object 
    JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR); // without this line, the console will be overwhelmed
    JitsiMeetJS.init(initConfigStandard); 

    // step 2/4: initalize a connection object
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
      this.conferenceRoom = this.jitsiConnector.initJitsiConference( // I assume `initJitsiConference` just joins the conference if it exists already
        "conference", 
        conferenceConfigStandard
      ); 
      
      // SET UP EVENT LISTENERS
      const { conference } = JitsiMeetJS.events; 

      this.conferenceRoom.on(conference.CONFERENCE_JOINED, async () => {
        const retrievedTracks = await this.getMyLocalTracks(); 

        // share the tracks to everybody else on the audio conference room
        for (const track of retrievedTracks) {
          this.conferenceRoom.addTrack(track);
        }
        // TODO: a user could also be muted initially, so the boolean value should not always be false 
        this.$set(this.isUserMutedMap, this.conferenceRoom.myUserId(), false);
      });
      
      this.conferenceRoom.on(conference.TRACK_ADDED, async (track) => {
        if (track.isLocal()) { 
          return;
        }

        // step 1/2: maintain rep invariant
        const participantID = track.getParticipantId();
        if (!this.remoteTracks[participantID]) {
          this.$set(this.remoteTracks, participantID, []);
        }
        
        // WARN: this operation is probably undetectable and therefore unreactive
        const idx = this.remoteTracks[participantID].push(track);
        
        // step 2/2: mount to DOM 
        const trackID = participantID + track.getType();
        if (track.getType() === 'video') {
          $("#remoteVideoTracks").append(`
            <p>participantID ${participantID}'s VIDEO</p>
            <video autoplay='1' id='${trackID}'></video>
          `);
        } else {
          $("#remoteAudioTracks").append(`
            <p>participantID ${participantID}'s AUDIO</p>
            <audio autoplay='true' id='${trackID}' />
          `);
        }
        track.attach($(`#${trackID}`)[0]);
      });

      // note USER_JOINED is only fired for other users and not ourselves
      this.conferenceRoom.on(conference.USER_JOINED, (userID) => { 
        this.$set(this.isUserMutedMap, userID, false);
        this.$set(this.remoteTracks, userID, []);
      });

      this.conferenceRoom.on(conference.DOMINANT_SPEAKER_CHANGED, (userID) => {
        this.dominantSpeakerID = userID; 
      });

      // muted tracks will already have no sound, but we still have maintain rep invariant
      this.conferenceRoom.on(conference.TRACK_MUTE_CHANGED, (track) => {
        this.$set(this.isUserMutedMap, track.getParticipantId(), track.isMuted());
      });

      this.conferenceRoom.on(conference.USER_LEFT, (userID) => {
        // maintain the rep invariant
        delete this.isUserMutedMap[userID]; 
        
        // clean up the tracks he/she shared
        // TODO: also remove the <p> tags with the labels, otherwise the UI looks like it didn't update correctly
        // FIXME: the detach() function throws errors, potentially related to https://github.com/jitsi/lib-jitsi-meet/issues/859
        for (const track of this.remoteTracks[userID]) {
          const htmlElement = document.getElementById(userID + track.getType());
          track.detach(htmlElement); // `detach` the data stream/track i.e. the src attribute 
          htmlElement.remove(); // remove the element itself
        }
      });

      // finally join the room 
      this.conferenceRoom.join();
    },
    /**
     * FIXME: createLocalTracks sometimes produces 2 audio tracks and 2 video tracks, instead of 1 each
     * TODO: add a function parameter in the future e.g. ["audio", "video"]
     */
    async getMyLocalTracks () {
      return new Promise(async (resolve) => {
        const retrievedTracks = await JitsiMeetJS.createLocalTracks({ devices: ['audio'] }); 
        for (const track of retrievedTracks) {
          if (track.getType() === "audio") {
            this.localMicTrack = track; 
          } else if (track.getType() === "video") {
            this.localCameraTrack = track; 
            $('#myLocalTracks').append(`<video autoplay='true' id='localVideo' style="width: 300px; height: 300px;"/>`);
            track.attach($(`#localVideo`)[0]);
          }
        }
        resolve(retrievedTracks);
      });
    },
    async toggleMic () {
      const myID = this.conferenceRoom.myUserId(); 
      if (this.isUserMutedMap[myID]) {
        await this.localMicTrack.unmute(); 
        this.$set(this.isUserMutedMap, myID, false);
      } else {
        await this.localMicTrack.mute(); 
        this.$set(this.isUserMutedMap, myID, true);  
      }
    },
    /**
    //  * Pre-condition: the user is already connected to the conference,
    //  * which is satisfied because the camera button is only displayed to the user when successfully connected.
    //  */
    // async toggleCamera () {
    //   if (!this.isCameraOn) {
    //     try {
    //       const requestedTracks = await JitsiMeetJS.createLocalTracks({
    //         devices: ["video"]
    //       });
    //       console.log("requestedTracks (should have length 1) =", requestedTracks);
    //       const cameraTrack = requestedTracks[0]; 
          
    //       // add to local DOM 
    //       $("#myLocalTracks").append(`
    //         <p>My Camera</p> 
    //         <video autoplay='true' id='myLocalCamera' style="height: 500px; width: 500px"/>
    //       `);
    //       cameraTrack.attach($("#myLocalCamera")[0]);

    //       // share to remote audio conference
    //       room.addTrack(cameraTrack);

    //       // maintain the rep invariant
    //       this.isCameraOn = true; 
    //       this.localCameraTrack = cameraTrack; 

    //       // print statements
    //       console.log("succesfully `added` cameraTrack to the conference rom")
    //       console.log("cameraTrack =", cameraTrack);
    //     } catch (error) {
    //       console.error(error);
    //     }
    //   }
      
    //   /**
    //    * It's important to understand what dispose means. Does it mean removing it from the Audio Conference room that everyone is connected to? 
    //    * Turns out yes, but it's not obvious. For example, it does not automatically call "detach()", so 
    //    * we have to manually clean up the DOM.
    //    */
    //   else if (this.isCameraOn) {
    //     console.log("disposing the video track")
    //     await this.localCameraTrack.dispose(); 
    //     console.log("succesfully disposed")
    //   }
    // },
    onDisconnect () {
      console.log("onDisconnectEvent emitted, now performing the callback onDisconnect()");
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
