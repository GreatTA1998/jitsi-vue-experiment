<template>
  <div>
    <h1>AUDIO CONFERENCE PLAYGROUND</h1>
    <p>otherUsers: {{ otherUsers }}</p>

    <!-- TODO: implement these buttons -->
    <button @click="toggleMic()">Toggle mute</button>
    <button @click="toggleCamera()">Toggle camera</button>
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
 * Connection
 *   - used to create conference rooms
 * 
 * @see Overall API: https://github.com/jitsi/lib-jitsi-meet/blob/master/doc/API.md
 * @see Specific Track API: https://github.com/jitsi/lib-jitsi-meet/blob/master/doc/API.md#jitsitrack
 *
 * TODO: 
 *   1. Make the `connection` object an instance variable i.e `this.connection` rather than a global variable 
 *   2. Now that everything is translated into Vue, display the state correctly e.g. muted, video, participants
 *   3. Test extensively and deploy onto a dummy Firebase website and test in isolation
 *   4. Only then, integrate into Explain, then test separately 
 *   5. I estimate that it'll take 1 week, but after that the cost of running Explain will be free
 *   6. Detect dominant speaker
 * 
 * FIXME:
 *   If you turn on the camera only after having established the connection, even though the video track is correctly detected by everyone,
 *   it isn't actually playing or it simply has no data for some reason. 
 *   Don't automatically randomly start trying to share local media. Find a way to await on that, or use the watch hook to manually trigger that.
 *   Cannot mute: even when I manually set the "mute" attributes of all audio elements to true, there is still an echo when two tabs are opened
 *   When switching from sharing video to sharing screen, something stops. FIX: create a simple method for sharing video (ignore screenshare) 
 *   A user sometimes shares two identical video tracks and two identical audio tracks. They should only share one of each. 
 *   How do I prevent ghosts from entering? FIX: don't reload using localhost:8080, as the destroyed hook is not properly called
 *   How can I get a reliable answer on how the reliability of Jitsi will change over the years?
 */
import { initConfigStandard, getConnectionConfigNikita, conferenceConfigStandard } from "@/JitsiConfigs.js"; 

let isVideo = true;
let isJoined = false;
let room = null;
let localTracks = [];
const remoteTracks = {};

export default {
  name: "JitsiAudioConferenceRoom",
  data () {
    return {
      myLocalTracks: {
        mic: null,
        camera: null
      },
      isMicOn: true, // quickfix for debugging purposes
      isCameraOn: false,
      otherUsers: [],
      jitsiConnector: null
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
   
    // .connect() does *not* return a promise, 
    // so the callback is defined in `room.on(...CONFERENCE_JOINED, callback)`
    this.jitsiConnector.connect(); 

    // step 4/4: make sure everything will be cleaned-up properly when destroyed
    $(window).bind('beforeunload', this.unload);
    $(window).bind('unload', this.unload);
  },
  beforeDestroy () {
    this.disposeTracksAndDisconnectFromConference();
  },
  methods: {
    /**
     * FIXME: createLocalTracks sometimes produces 2 audio tracks and 2 video tracks, instead of 1 each
     * In the future, add a parameter ("video: true, audio: true")?
     */
    async shareMyLocalTracks () {
      return new Promise(async (resolve) => {
        // @param tracks Array with JitsiTrack objects
        const tracks = await JitsiMeetJS.createLocalTracks({ devices: ['audio'] }); // can be ['audio', 'video']
        console.log(`created ${tracks.length} tracks`);
        localTracks = tracks;
        // TODO: phase out localTracks 
        for (const track of localTracks) {
          if (track.getType() === "audio") {
            this.$set(this.myLocalTracks, "mic", track);
          } else {
            this.$set(this.myLocalTracks, "camera", track);
          }

          if (track.getType() === 'video') {
            $('#myLocalTracks').append(`<video autoplay='true' id='localVideo' style="width: 300px; height: 300px;"/>`);
            track.attach($(`#localVideo`)[0]);
          } 
        }
        resolve();
      });
    },
    onConnectionSuccess () {
      room = this.jitsiConnector.initJitsiConference( // I assume `initJitsiConference` just joins the conference if it exists already
        "conference", 
        conferenceConfigStandard
      ); 
      
      // SET UP EVENT LISTENERS
      const { conference } = JitsiMeetJS.events; 

      // TODO: sometimes tracks are added twice because there are two places that add the local tracks depending on the value of isJoined
      // FIX: this is exactly why sometimes one participant will share duplicate tracks
      room.on(conference.CONFERENCE_JOINED, async () => {
        isJoined = true;
        await this.shareMyLocalTracks(); 
        for (const track of localTracks) {
          room.addTrack(track);
        }
      });
      
      room.on(conference.TRACK_ADDED, (track) => {
        console.log("track was added to the audio conference")
        if (track.isLocal()) { 
          console.log("but it's from me myself")
          return;
        }
        console.log("track is indeed from someone else, and is of type =", track.getType());
        const participantID = track.getParticipantId();
        if (!remoteTracks[participantID]) {
          remoteTracks[participantID] = [];
        }
        const idx = remoteTracks[participantID].push(track);

        // handle other people muting their tracks here
        const { TRACK_MUTE_CHANGED, LOCAL_TRACK_STOPPED } = JitsiMeetJS.events.track; // cannot destructure track because its already declared as a variable)
        track.addEventListener(TRACK_MUTE_CHANGED, () => 
          console.log('remote track muted')
        );
        track.addEventListener(LOCAL_TRACK_STOPPED, () => 
          console.log('remote track stopped')
        );
        
        // mount to DOM 
        const trackID = participantID + track.getType();
        if (track.getType() === 'video') {
          $("#remoteVideoTracks").append(`
            <p>participantID ${participantID}'s VIDEO</p>
            <video autoplay='true' id='${trackID}' style="height: 500px; width: 500px"/>
          `);
        } else {
          $("#remoteAudioTracks").append(`
            <p>participantID ${participantID}'s AUDIO</p>
            <audio autoplay='true' id='${trackID}' />
          `);
        }
        track.attach($(`#${trackID}`)[0]);
      });

      room.on(conference.TRACK_REMOVED, (track) => {
        // TODO: remove the tracks from the local state and UI (worry about state first)
        console.log(`The track ${track} was removed`);
      });

      room.on(conference.USER_JOINED, (userID) => {
        this.otherUsers.push(userID);
        remoteTracks[userID] = [];
      });

      room.on(conference.USER_LEFT, (userID) => {
        // TODO: this pre-condition check is redundant if the rep invariant is maintained in the component
        if (!remoteTracks[userID]) { 
          console.log("rep invariant violated: user has no remote tracks for some reason");
          return;
        }
        // FIXME: the detach() function throws errors 
        // potentially related to https://github.com/jitsi/lib-jitsi-meet/issues/859
        for (const track of remoteTracks[userID]) {
          const htmlElement = document.getElementById(userID + track.getType());
          track.detach(htmlElement); // `detach` the data stream/track i.e. the src attribute 
          htmlElement.remove(); // remove the element itself
        }
      });

      room.on(conference.TRACK_MUTE_CHANGED, (track) => 
        // TODO: mute that participant
        console.log(`${track.getType()} - ${track.isMuted()}`)
      );
  
      room.join();
    },
    onDisconnect () {
      console.log("onDisconnectEvent emitted, now performing the callback onDisconnect()");
      const { CONNECTION_ESTABLISHED, CONNECTION_FAILED, CONNECTION_DISCONNECTED } = JitsiMeetJS.events.connection; 
      this.jitsiConnector.removeEventListener(CONNECTION_ESTABLISHED, this.onConnectionSuccess);
      this.jitsiConnector.removeEventListener(CONNECTION_FAILED, this.onConnectionFailed);
      this.jitsiConnector.removeEventListener(CONNECTION_DISCONNECTED, this.onDisconnect);
    },
    // TODO: the following code should also be performed in the destroyed hook
    // TODO: use the composition API to reduce surface area for the cleanup code
    unload () {
      this.disposeTracksAndDisconnectFromConference();
    },  
    disposeTracksAndDisconnectFromConference () {
      for (const track of localTracks) {
        track.dispose(); 
      }
      room.leave();
      this.jitsiConnector.disconnect();
    },
    /**
     * FIXME: the muting behavior doesn't actually work. Possible causes: 
     *   There is something hidden that is playing the audio source without needing the HTML element
     *   Adding the "muted" attribute manually doesn't work
     *   Look at StackOverflow, use everything you have to figure it out. 
     */
    async toggleMic () {
      console.log("myLocalTracks.audio =", this.myLocalTracks.mic);
      // rename to this.localMicTrack
      // rename to this.cameraMicTrack
      if (this.isMicOn) {
        console.log("before muting, audio track =", this.myLocalTracks.mic);
        console.log("isMuted =", this.myLocalTracks.mic.isMuted());
        await this.myLocalTracks.mic.mute(); 
        this.isMicOn = false; 
        console.log("after muting, audio track =", this.myLocalTracks.mic); 
        console.log("isMuted =", this.myLocalTracks.mic.isMuted());
      } else {
        console.log("unmuting");
        await this.myLocalTracks.mic.unmute(); 
        this.isMicOn = true; 
        console.log("unmuted");
      } 
    },
    /**
     * Pre-condition: the user is already connected to the conference,
     * which is satisfied because the camera button is only displayed to the user when successfully connected.
     */
    async toggleCamera () {
      if (!this.isCameraOn) {
        try {
          const requestedTracks = await JitsiMeetJS.createLocalTracks({
            devices: ["video"]
          });
          console.log("requestedTracks (should have length 1) =", requestedTracks);
          const cameraTrack = requestedTracks[0]; 
          
          // add to local DOM 
          $("#myLocalTracks").append(`
            <p>My Camera</p> 
            <video autoplay='true' id='myLocalCamera' style="height: 500px; width: 500px"/>
          `);
          cameraTrack.attach($(`#myLocalCamera`)[0]);

          // share to remote audio conference
          room.addTrack(cameraTrack);

          // maintain the rep invariant
          this.isCameraOn = true; 
          this.$set(this.myLocalTracks, "camera", cameraTrack);

          // print statements
          console.log("succesfully `added` cameraTrack to the conference rom")
          console.log("cameraTrack =", cameraTrack);
        } catch (error) {
          console.error(error);
        }
      }
      
      /**
       * It's important to understand what dispose means. Does it mean removing it from the Audio Conference room that everyone is connected to? 
       * Turns out yes, but it's not obvious. For example, it does not automatically call "detach()", so 
       * we have to manually clean up the DOM.
       * 
       * No need to go for a perfect refactor. Just think clearly, rest well, draw diagrams, think from first principles, and move fast, don't be afraid to make mistakes, 
       * and iteratively test. Never deploy something in a rush. Test something thoroughly, and change mindsets. Because they are contradicting traits, and you can't have contradicting traits co-exist at the same time, that's why it's much better to be a creator and then an editor, and never mix up certain attributes together.
       * That's why you play hard and work hard. There are other places where you can balance it out, but other parts where you have to be really one or the other. 
       */
      else if (this.isCameraOn) {
        console.log("disposing the video track")
        await this.myLocalTracks.camera.dispose(); 
        console.log("succesfully disposed")

        // also have to unmount
      }
    },
    // TODO: display an error popup message
    onConnectionFailed (e) {
      console.error("Connection Failed e =", e);
    }
  }
};
</script>
