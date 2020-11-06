<template>
  <div>
    <h1>Video Conference Playground</h1>
    <p>errorMessageForSafariDebug: {{ errorMessageForSafariDebug }}</p>
    <p>isUserMutedMap: {{ isUserMutedMap }}</p>
    <p>isUserCameraOnMap: {{ isUserCameraOnMap }}</p>
    <p>isUserSharingScreenMap: {{ isUserSharingScreenMap }}</p>
    <p>dominantSpeakerID: {{ dominantSpeakerID }}</p>

    <button @click="toggleMic()">Toggle mute</button>
    <!-- the `:disabled` property below is necessary to respect Jitsi's limitation: only one video feed can be shared per user -->
    <button @click="toggleCamera()" :disabled="localScreenTrack">Toggle camera</button>
    <button @click="toggleScreen()" :disabled="localCameraTrack">Toggle screen-share</button>
    <button @click="disposeTracksAndDisconnectFromConference()">Hang up</button>

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
 * // TODO: 
 *      1. Tracks not getting removed (but they get removed wen users disconnect) ()
 *      3. Parallelize the "getLocalTracks" s
 *      2. Safety from concurrency
 *      4. Mirror the camera video
 * 
 * // TRACKS NOT GETTING REMOVED 
 *       Find out as much information as efficiently as possible 
 *       When you toggle on/off the laptop video, only on the next turning on will the old video be cleaned up. So it kind of works
 *       When you toggle off the iPhone video, even the laptop just has a frozen track. It's as if it's unable to fire a "TRACK_REMOVED" event in the first place. Furthermore,
 *       there is a null value in the `isUserSharingScreenMap` suggesting that the logic is throwing an uncaught error. How can that be? 
 *       When I toggle off the camera on Chrome, *two* instances of TRACK_REMOVED is called 
 *       Moreover, when the iPhone toggles off Safari, TRACK_REMOVED is *not* not called
 *       The error event: 
 * 
 * I expect the worst: 
 *   - Devices not working: test out multiple versions and devices 
 *   - Explicitly error handling: test out multiple scenarios and handle these errors with an alert
 *      4. (Devices not working?): test out multiple different versions and devices
 *      5. (Explicit error handling?): test out multiple scenarios and handle these errors with an alert
 *      5. Release Vue plugin: lower-level API without being too level and taking care of things that don't matter
 *      7. Integrate into Explain with UI and good component interface
 * 
 *   I will need around 1 more week to do a very good job on this. I should not rush to deploy. I need to learn to be more patient. 
 * 
 *   Then, the open-recruitment plan, 
 *       Establish the culture of changing the world, Don Quixote, radical help and openness, experimentalism, big dreams, encouraging each other
 *       values: open-learning, knowledge-sharing, and visual explanations, efficient help (i.e. startup and not rely on donations) (why can't I piss of the investors? Are they the right investors in the first place?)
 * 
 * // NICE TO HAVE: 
 *    Broadcasting to multiple people?
 *    Meeting link 
 *    When you're debugging, you want AS MANY unexpected things to be going on, as that'd be giving you extra information
 * 
 * KNOWN ISSUES: 
 *   - Errors are not explicitly handled (e.g. no popup is shown)
 *   - The dominant speaker event is sometimes not very accurate or responsive
 *   - Sharing the video for the first time sometimes doesn't work if laptop Chrome is sharing to iOS Safari
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
      // for iOS debugging
      errorMessageForSafariDebug: "",

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

    // THIS IS THE MOST IMPORTANT CALLBACK OF THIS COMPONENT
    this.jitsiConnector.addEventListener(
      CONNECTION_ESTABLISHED, 
      this.exchangeAudioVideoTracksAndMaintainRep
    );

    // helper function for DISCONNECTED (need a reference to this function because there currently is no way to remove event listeners without specifying the callback)
    const removeJitsiConnectorEventListeners = () => {
      const { CONNECTION_ESTABLISHED, CONNECTION_FAILED, CONNECTION_DISCONNECTED } = JitsiMeetJS.events.connection; 
      this.jitsiConnector.removeEventListener(CONNECTION_ESTABLISHED, this.exchangeAudioVideoTracksAndMaintainRep);      
      this.jitsiConnector.removeEventListener(CONNECTION_FAILED, (e) => console.error("Connection failed, error =", e)); // can display an explicit error popup 
      this.jitsiConnector.removeEventListener(CONNECTION_DISCONNECTED, removeJitsiConnectorEventListeners);
    }
    this.jitsiConnector.addEventListener(CONNECTION_DISCONNECTED, removeJitsiConnectorEventListeners);
    this.jitsiConnector.addEventListener(CONNECTION_FAILED, (e) => console.error("Connection failed, error =", e));  // can display an explicit error popup
   
    // step 3/4 .connect() does *not* return a promise, so the callback is defined in `room.on(...CONFERENCE_JOINED, callback)`
    this.jitsiConnector.connect(); 

    // step 4/4: make sure everything will be cleaned-up properly when destroyed
    $(window).bind("beforeunload", this.disposeTracksAndDisconnectFromConference);
    $(window).bind("unload", this.disposeTracksAndDisconnectFromConference);
  },
  beforeDestroy () {
    this.disposeTracksAndDisconnectFromConference();
  },
  methods: {
    disposeTracksAndDisconnectFromConference () {
      if (this.localMicTrack) this.localMicTrack.dispose(); 
      if (this.localCameraTrack) this.localCameraTrack.dispose(); 
      if (this.localScreenTrack) this.localScreenTrack.dispose(); 
      this.conferenceRoom.leave();
      this.jitsiConnector.disconnect();
    },
    exchangeAudioVideoTracksAndMaintainRep () {
      this.conferenceRoom = this.jitsiConnector.initJitsiConference("conference", conferenceConfigStandard); // I assume `initJitsiConference` just joins the conference if it exists already
      
      // this single line of code solves the broken video issue that I spent 10+ hours to debug
      // see https://github.com/jitsi/lib-jitsi-meet/issues/1333#issuecomment-711107368
      // see https://github.com/jitsi/lib-jitsi-meet/issues/1363
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

      // note CONFERENCE_JOINED is fired for myself only 
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

      // note USER_JOINED is only fired for other users and not ourselves
      this.conferenceRoom.on(USER_JOINED, (userID) => { 
        initUserMetadata(userID); 
      });

      this.conferenceRoom.on(USER_LEFT, (userID) => {        
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
        if (track.isLocal()) return; // TODO: re-write: participantID = myUserId()
        
        const userID = track.getParticipantId(); 
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
        console.log("TRACK_REMOVED, track =", track); 
        const htmlElement = document.getElementById(track.getParticipantId() + track.getType());
        if (htmlElement) htmlElement.remove(); // if it's my track, then there would be no HTML element to remove
        if (track.getType() === "video") {
          // TODO: handle the difference between the screen and the video
          this.$set(this.isUserCameraOnMap, track.getParticipantId(), false); 
          this.$set(this.isUserSharingScreenMap, track.getParticipantId(), false); 
        }
        // note that there is no need to handle audio because that means the user left the conference altogether,
        // so the metadata will be already handled by "USER_LEFT"  
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
        const [ cameraTrack ] = await JitsiMeetJS.createLocalTracks({ devices: ["video"], facingMode: "user" });
        this.conferenceRoom.addTrack(cameraTrack);
        this.handleMyNewCameraTrack(cameraTrack);
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
          await this.localCameraTrack.dispose(); // can be a simpler alternative to the above code
          $("#myLocalCameraTrack").remove(); // NOTE: if .remove() is called before .dispose() resolves, then the camera light remains on

          // maintain rep 
          this.localCameraTrack = null; 
          this.$set(this.isUserCameraOnMap, this.myID, false); 
        } catch (error) {
          console.log("error =", error); 
          this.errorMessageForSafariDebug = error.message; 
        }
      }
    },
    async toggleScreen () {
      if (! this.isUserSharingScreenMap[this.myID]) {
        const [ screenTrack ] = await JitsiMeetJS.createLocalTracks({ devices: ["desktop"] });
        this.putVideoTrackOntoDOM({ videoTrack: screenTrack, htmlElementID: "myLocalScreenTrack" });
        this.conferenceRoom.addTrack(screenTrack); 

        // maintain rep
        this.$set(this.isUserSharingScreenMap, this.myID, true); 
        this.localScreenTrack = screenTrack; 
      }
      else {
        await this.localScreenTrack.dispose(); 
        $("#myLocalScreen").remove(); 

        // maintain rep
        this.localScreenTrack = null; 
        this.$set(this.isUserSharingScreenMap, this.myID, false); 
      }
    },
    handleMyNewCameraTrack (cameraTrack) {
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
