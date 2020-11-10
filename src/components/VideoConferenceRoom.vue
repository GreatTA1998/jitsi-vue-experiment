<template>
  <div>
    <h1>VIDEO CONFERENCE PLAYGROUND</h1>
    <p>myDisplayName: <u>{{ myDisplayName }}</u></p>
    <p>jitsiConnectorStatus: {{ jitsiConnectorStatus }}, conferenceRoomStatus: {{ conferenceRoomStatus }}</p>
    
    <p>EVENT HISTORY<p> 
    <ul>
      <li v-for="(log, i) in eventLogs" :key="i">
        {{ log }}
      </li>
    </ul>

    <template v-if="conferenceRoomStatus === 'NOT_CONNECTED'">
      <input placeholder="Type your name here..." v-model="myDisplayName"/>
      <button v-if="jitsiConnectorStatus === 'INITIALIZED'" @click="joinConferenceRoom()">
        Join video conference
      </button>
    </template>

    <template v-else-if="conferenceRoomStatus === 'CONNECTING'">
      Connecting...
    </template>

    <template v-else-if="conferenceRoomStatus === 'CONNECTED'">
      <button @click="toggleMic()">Toggle mute</button>
      <!-- the `:disabled` property below is necessary to respect Jitsi's limitation: only one video feed can be shared per user -->
      <button @click="toggleCamera()" :disabled="localScreenTrack">Toggle camera</button>
      <button @click="toggleScreen()" :disabled="localCameraTrack">Toggle screen-share</button>
      <button @click="disposeTracksAndDisconnectFromConference()">Hang up</button>

      <p>isUserMutedMap: {{ isUserMutedMap }}</p>
      <p>isUserCameraOnMap: {{ isUserCameraOnMap }}</p>
      <p>isUserSharingScreenMap: {{ isUserSharingScreenMap }}</p>
      <p>dominantSpeakerID: {{ dominantSpeakerID }}</p>
    </template>

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
 * CRITICAL ISSUES: 
 *   - Initial connections sometimes doesn't work, requiring to refresh multiple times
 *   - TRACK_REMOVED does not fire properly for iOS Safari and Windows Chrome 
 * 
 *  KNOWN ISSUES: 
 *   - The dominant speaker event is sometimes not very accurate or responsive
 *   - Sharing the video for the first time sometimes doesn't work if laptop Chrome is sharing to iOS Safari
 *   - User left is not fired
 *    
 *  Bugs in the library: 
 *    - setEffect(undefined); @see disposing muted track issue
 *    - setSenderVideoConstraint(180); 
 *    - update to the latest version of Jitsi 
 *    - Enable lipsync: false @see https://community.jitsi.org/t/jitsi-dev-jitsi-jitsi-videobridge-enable-lipsync-by-default-304/11336
 * 
 *  Strophe and lib-jitsi-meet-dist dependency issues (try cloning the example repository and modify it and work from there)
 * 
 *  Connection config (serviceURL if it's broken then it doesn't work, the `bosh` config option is deprecated)
 *  serviceUrl: 'https://meet.jit.si/http-bind?room=' + "<put-future-room-id-here>",
 *  clientNode: 'http://jitsi.org/jitsimeet',
 * 
 * // TODO: optimize for debugging
 *      - Clear visual debugging, including display names and not just participant IDs
 *      - Select audio input / output devices 
 *      - Display audio levels (including input speaker and output speaker
 *      - Parallelize the "getLocalTracks"
 *      - Safety from concurrency (what happens if destroyed () is called before created () resolves?)
 *      - TODO: give browser-specific fix tips for video/audio conferencing
 *      - Explicit error handling with helpful "How to fix" tips
 *      - Release Vue plugin: lower-level API without being too level and taking care of things that don't matter. Find a way to get other
 *      - Vue-Jitsi developers to contribute to the project. 
 *      - Find a way to lower the barrier to contribute to lib-jitsi-meet (schedule a pair program session)?
 *      - Integrate into Explain with UI and good component interface
 * 
 * // TEST PARTITIONS
 *      1. Partition on devices: mobile, laptop, safari
 *      2. Partition on browsers: Safari, Chrome, Edge and Firefox
 *      3. Partition on number of users: 1, 2, 3 to 10, >10
 * 
 *    NICE TO HAVE: 
 *      - Broadcasting to multiple people?
 */
import { fullConfig, initConfigStandard, getConnectionConfigNikita, conferenceConfigStandard } from "@/JitsiConfigs.js"; 
export default {
  name: "VideoConferenceRoom",
  data () {
    return {
      myDisplayName: "",
      eventLogs: [],

      jitsiConnector: null,
      jitsiConnectorStatus: "NOT_INITIALIZED", // enumeration: NOT INITIALIZED, INITIALIZING, INITIALIZED, FAILED
      conferenceRoom: null, 
      conferenceRoomStatus: "NOT_CONNECTED", // enumeration: NOT_CONNECTED, CONNECTING, CONNECTED

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
    this.jitsiConnectorStatus = "INITIALIZING";
    JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR); // without this line, the console will be overwhelmed
    JitsiMeetJS.init(fullConfig);  // JitsiMeetJS.init(initConfigStandard); 

    // step 2/4: initalize a `Connection` object
    this.jitsiConnector = new JitsiMeetJS.JitsiConnection(null, null, fullConfig); // getConnectionConfigNikita("put-room-id-here")
    const { CONNECTION_ESTABLISHED, CONNECTION_FAILED, CONNECTION_DISCONNECTED } = JitsiMeetJS.events.connection;

    this.jitsiConnector.addEventListener(CONNECTION_ESTABLISHED, () => this.jitsiConnectorStatus = "INITIALIZED");

    // helper function for DISCONNECTED (need a reference to this function because there currently is no way to remove event listeners without specifying the callback)
    const removeJitsiConnectorEventListeners = () => {
      const { CONNECTION_ESTABLISHED, CONNECTION_FAILED, CONNECTION_DISCONNECTED } = JitsiMeetJS.events.connection; 
      this.jitsiConnector.removeEventListener(CONNECTION_ESTABLISHED, () => this.jitsiConnectorStatus = "INITIALIZED");      
      this.jitsiConnector.removeEventListener(CONNECTION_FAILED, (error) => handleConnectFailure(error)); // can display an explicit error popup 
      this.jitsiConnector.removeEventListener(CONNECTION_DISCONNECTED, removeJitsiConnectorEventListeners);
    }
    const handleConnectFailure = (error) => {
      this.jitsiConnectorStatus = "FAILED"; 
      alert(`Error: ${error.message}`);
      console.log("Connection failed, error =", error); 
    }

    this.jitsiConnector.addEventListener(CONNECTION_DISCONNECTED, removeJitsiConnectorEventListeners);
    this.jitsiConnector.addEventListener(CONNECTION_FAILED, (error) => handleConnectFailure(error));  // can display an explicit error popup
   
    // step 3/4 .connect() does *not* return a promise, so the callback is defined in `room.on(...CONFERENCE_JOINED, callback)`
    this.jitsiConnector.connect(); 

    // step 4/4: make sure everything will be cleaned-up properly when destroyed
    // FIXME: on iOS Safari, abruptively closing a tab will not give enough time for the cleanup to finish resolving
    $(window).bind("beforeunload", this.disposeTracksAndDisconnectFromConference);
    $(window).bind("unload", this.disposeTracksAndDisconnectFromConference);
  },
  beforeDestroy () {
    this.disposeTracksAndDisconnectFromConference();
  },
  methods: {
    async disposeTracksAndDisconnectFromConference () {
      if (this.localMicTrack) this.localMicTrack.dispose(); 
      if (this.localCameraTrack) this.localCameraTrack.dispose(); 
      if (this.localScreenTrack) this.localScreenTrack.dispose(); 

      // the `await` only matters if the user is switching between different AV rooms but still has the website open
      // otherwise I don't think the browser will literally wait for it to resolve before closing.
      if (this.conferenceRoom) await this.conferenceRoom.leave(); // the if statement is necessary because of concurrency: the destroyed () hook can be called before created () resolves
      this.jitsiConnector.disconnect(); // however, jitsiConnector by definition must have been initialized 
    },
    /**
     * Exchanges audio and video track, and ensures that the rep is maintained for every possible operations. 
     */
    joinConferenceRoom () {
      this.conferenceRoomStatus = "CONNECTING"; 
      this.conferenceRoom = this.jitsiConnector.initJitsiConference("conference", fullConfig); // `initJitsiConference` just joins the conference if it exists already // conferenceConfigStandard
      this.conferenceRoom.setDisplayName(this.myDisplayName); 

      /**
       * This single line of code solves the broken video issue that I spent 10+ hours to debug
       * @see https://github.com/jitsi/lib-jitsi-meet/issues/1333#issuecomment-711107368
       * @see https://github.com/jitsi/lib-jitsi-meet/issues/1363
       */
      this.conferenceRoom.setSenderVideoConstraint(360);

      this.conferenceRoom.setReceiverVideoConstraint(360); // not sure if this is necessary though

      // we now handle these following events: 
      const { 
        CONFERENCE_JOINED,
        TRACK_ADDED, 
        TRACK_REMOVED,
        USER_JOINED,
        DOMINANT_SPEAKER_CHANGED,
        TRACK_MUTE_CHANGED,
        USER_LEFT } = JitsiMeetJS.events.conference;

      // 1st helper function
      const initUserMetadata = (userID) => {
        this.$set(this.isUserMutedMap, userID, false);
        this.$set(this.isUserCameraOnMap, userID, false);
        this.$set(this.isUserSharingScreenMap, userID, false); 
        this.$set(this.remoteTracks, userID, []);
      }

      // 2nd helper function 
      const getNameFromID = (userID) => {
        const user = this.conferenceRoom.getParticipantById(userID); 
        return user ? user._displayName : "";
      }
    
      this.conferenceRoom.on(CONFERENCE_JOINED, async () => { // note that CONFERENCE_JOINED is fired for myself only 
        this.conferenceRoomStatus = "CONNECTED"; 
        initUserMetadata(this.myID); 
        const myLocalTracks = await JitsiMeetJS.createLocalTracks({ devices: ["audio"] }); 
        for (const track of myLocalTracks) {
          this.eventLogs.push(`I'm sharing ${track.getType()} track...`);
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

      this.conferenceRoom.on(USER_JOINED, (userID) => { // note that USER_JOINED is only fired for other users and not ourselves
        this.eventLogs.push(`USER_JOINED: ${getNameFromID(userID)} (${userID})`);
        initUserMetadata(userID); 
      });

      this.conferenceRoom.on(USER_LEFT, (userID) => {  
        this.eventLogs.push(`USER_LEFT: ${getNameFromID(userID)} (${userID}) left`);      
        for (const track of this.remoteTracks[userID]) {
          const htmlElement = document.getElementById(userID + track.getType());
          if (htmlElement) { // TODO: this if statement violates the "fail fast" principle and is also unnecessary given the assumption that all remote tracks are mounted
            track.detach(htmlElement); // `detach` the data stream/track i.e. can think of it *like* a `src` attribute 
            htmlElement.remove(); // remove the element itself
          }
        } 
        // "uninit" user metadata
        this.$delete(this.isUserMutedMap, userID); 
        this.$delete(this.isUserCameraOnMap, userID); 
        this.$delete(this.isUserSharingScreenMap, userID); 
        this.$delete(this.remoteTracks, userID);
      });
  
      this.conferenceRoom.on(TRACK_ADDED, async (track) => {
        const userID = track.getParticipantId(); 
        if (userID) {
          this.eventLogs.push(`TRACK_ADDED: Detected ${track.getType()} track from ${getNameFromID(userID)} (${userID})`);
        } else {
          this.eventLogs.push(`TRACK_ADDED: Detected ${track.getType()} track from myself`);
        }

        if (track.isLocal()) return; // TODO: re-write: participantID = myUserId()


        /**
         * NOTE: we handle track.stopped() because TRACK_REMOVED does not correctly fire for iOS browsers
         * Otherwise, only handling "TRACK_REMOVED" would have been sufficient. 
         */
        track.addEventListener(JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED, (parameter) => {
          console.log("LOCAL_TRACK_STOPPED, parameter =", parameter); 
          alert("LOCAL_TRACK_STOPPED, clean up the DOM"); 

          // FIXME: re-use the same function, don't copy and paste code
          // document.getElementById(userID + track.getType()).remove(); 
        });

        // How do you know if it's working or not
        track.addEventListener(
          JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED,
          () => console.log('remote track stoped')
        );

        
        const trackID = userID + track.getType();
        this.remoteTracks[userID].push(track);  // WARNING: if USER_JOINED is not always executed before TRACK_ADDED, then remoteTracks[userID] can be undefined.
                                                // Moreover, this operation is probabably not reactive. 
        if (track.getType() === 'video') {
          this.putVideoTrackOntoDOM({ videoTrack: track, htmlElementID: trackID }); 
          this.$set(this.isUserCameraOnMap, userID, true); 
        } else {
          $("#remoteAudioTracks").append(`<audio autoplay id="${trackID}"/>`);
          track.attach($(`#${trackID}`)[0]);
          this.$set(this.isUserMutedMap, userID, track.isMuted()); // unlike video, an added audio track can be muted/unmuted
        }
      });

      // tracks can be removed even if the user didn't leave. 
      // For example, the user can toggle their camera/screen on/off
      this.conferenceRoom.on(TRACK_REMOVED, (track) => {
        const userID = track.getParticipantId(); 
        if (userID) {
          this.eventLogs.push(`TRACK_REMOVED: ${getNameFromID(userID)} (${userID}) unshared his/her ${track.getType()} track`);
        } else {
          // note that remoteParticipantIDs is also not available TRACK_REMOVED
          this.eventLogs.push(`TRACK_REMOVED: someone unshared ${track.getType()} track`);
        }

        if (track.isLocal()) return; // otherwise getParticipantId() returns null, and there is also no HTML element to remove
 
        document.getElementById(userID + track.getType()).remove(); 
        if (track.getType() === "video") {
          // TODO: handle the difference between the screen and the video
          // track.getVideoType(); 
          this.$set(this.isUserCameraOnMap, userID, false); 
          this.$set(this.isUserSharingScreenMap, userID, false); 
        }
        // note that there is no need to handle audio because that means the user left the conference altogether,
        // so the metadata will be already handled by "USER_LEFT"  
      });

      this.conferenceRoom.on(DOMINANT_SPEAKER_CHANGED, (userID) => 
        this.dominantSpeakerID = userID
      );
      
      // muted tracks will already have no sound, but we still have maintain the rep invariant
      this.conferenceRoom.on(TRACK_MUTE_CHANGED, (track) => {
        const userID = track.getParticipantId(); 
        if (userID) {
          this.eventLogs.push(`TRACK_MUTE_CHANGED: ${getNameFromID(userID)} (${userID})`)
        } else {
          this.eventLogs.push(`TRACK_MUTED: (Me myself)`);
        }
        this.$set(this.isUserMutedMap, track.getParticipantId(), track.isMuted())
      });

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
        try {
          const [ cameraTrack ] = await JitsiMeetJS.createLocalTracks({ devices: ["video"], facingMode: "user" }); // facingMode: "user" does not seem to do anything (I thought it would mirror the video source)
          this.conferenceRoom.addTrack(cameraTrack);
          this.handleMyNewCameraTrack(cameraTrack);
        } catch (error) {
          alert(`Error: ${error.message}`);
          console.log("Error turning on camera: ", error); 
        }
      } 

      /**
       * FIXME: an error occurs when you toggle off the camera on iOS Safari
       * @see https://github.com/jitsi/lib-jitsi-meet/issues/1105
       * 
       * LOCAL_TRACK_STOPPED: a potential work-around is to have each track remove itself from the DOM if it is stopped 
       * For example, track.on(LOCAL_TRACK_STOPPED, cleanUpTrackElement). But that does not get around the issue of stopping camera. 
       */
      else {
        try {
          // TODO: find out if .dispose() already calls .removeTrack()
          // await Promise.all([
          //   this.localCameraTrack.dispose(),
          //   this.conferenceRoom.removeTrack(this.localCameraTrack)
          // ]);

          // without this line before, `.dispose()` will cause an error for iOS safari; 
          // this.localCameraTrack.setEffect(undefined); 
          // console.log("after resetting, this.localCameraTrack =", this.localCameraTrack);

          await this.localCameraTrack.dispose(); // can be a simpler alternative to the above code
          $("#myLocalCameraTrack").remove(); // NOTE: if .remove() is called before .dispose() resolves, then the camera light remains on

          // maintain rep 
          this.localCameraTrack = null; 
          this.$set(this.isUserCameraOnMap, this.myID, false); 
        } catch (error) {
          alert(`Error: ${error.message}`);
          console.log("Error turning off camera: ", error); 
        }
      }
    },
    async toggleScreen () {
      if (! this.isUserSharingScreenMap[this.myID]) {
        const [ screenTrack ] = await JitsiMeetJS.createLocalTracks({ devices: ["desktop"] });
        screenTrack.setEffect(undefined); // workaround for Jitsi bug, see https://github.com/jitsi/lib-jitsi-meet/issues/1363#issuecomment-723666477
        this.putVideoTrackOntoDOM({ videoTrack: screenTrack, htmlElementID: "myLocalScreenTrack" });
        this.conferenceRoom.addTrack(screenTrack); 

        // maintain rep
        this.$set(this.isUserSharingScreenMap, this.myID, true); 
        this.localScreenTrack = screenTrack; 
      }
      else {
        this.localScreenTrack.setEffect(undefined); 
        await this.localScreenTrack.dispose(); 
        $("#myLocalScreen").remove(); 

        // maintain rep
        this.localScreenTrack = null; 
        this.$set(this.isUserSharingScreenMap, this.myID, false); 
      }
    },
    handleMyNewCameraTrack (cameraTrack) {
      cameraTrack.setEffect(undefined); // workaround for Jitsi bug, see https://github.com/jitsi/lib-jitsi-meet/issues/1363#issuecomment-723666477
      this.putVideoTrackOntoDOM({ videoTrack: cameraTrack, htmlElementID: "myLocalCameraTrack" });

      // maintain rep
      this.localCameraTrack = cameraTrack; 
      this.$set(this.isUserCameraOnMap, this.myID, true); 
    },
    /**
     * A helper function which, given a video track object, creates a HTML <video/> element. 
     * To support browser compatibility, the following attributes are included: 
     *    - muted: Chrome's new requirement
     *    - playsinline: iOS Safari contain attributes necessary for browser compatibility, especially for iOS Safari.
     * @see https://stackoverflow.com/questions/17994666/video-auto-play-is-not-working-in-safari-and-chrome-desktop-browser
     */
    putVideoTrackOntoDOM ({ videoTrack, htmlElementID }) {
      // TODO: do different display sizes and mirroring behavior for screen-share and camera-share
      $("#myLocalTracks").append(` 
        <p>This is/was a video element</p>
        <video autoplay muted playsinline id="${htmlElementID}" style="width: 300px; height: 300px; transform: scaleX(-1);"/>
      `);
      videoTrack.attach($(`#${htmlElementID}`)[0]);
    }
  }
};
</script>
