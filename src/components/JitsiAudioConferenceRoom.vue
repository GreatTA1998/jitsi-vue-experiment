<template>
  <div>
    <h1>JITSI AUDIO CONFERENCE PLAYGROUND</h1>
    <p>otherUsers: {{ otherUsers }}</p>
    <!-- <p>myLocalTracks: {{ myLocalTracks }}</p> -->

    <!-- TODO: implement these buttons -->
    <button @click="toggleMic()">Toggle mute</button>
    <button @click="toggleCamera()">Toggle camera</button>
    <button @click="toggleScreen()">Toggle screenshare</button>

    <button @click="unload()">Unload</button>
    <button @click="switchVideo()">Switch video</button>

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
 * TODO: 
 *   1. Make the `connection` object an instance variable i.e `this.connection` rather than a global variable 
 *   2. Now that everything is translated into Vue, display the state correctly e.g. muted, video, participants
 *   3. Test extensively and deploy onto a dummy Firebase website and test in isolation
 *   4. Only then, integrate into Explain, then test separately 
 *   5. I estimate that it'll take 1 week, but after that the cost of running Explain will be free
 * 
 * FIXME:
 *   Cannot mute: even when I manually set the "mute" attributes of all audio elements to true, there is still an echo when two tabs are opened
 *   When switching from sharing video to sharing screen, something stops. FIX: create a simple method for sharing video (ignore screenshare) 
 *   A user sometimes shares two identical video tracks and two identical audio tracks. They should only share one of each. 
 *   How do I prevent ghosts from entering? FIX: don't reload using localhost:8080, as the destroyed hook is not properly called
 *   How can I get a reliable answer on how the reliability of Jitsi will change over the years? 
 * 
 * @see https://github.com/jitsi/lib-jitsi-meet/blob/master/doc/API.md
 * 
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
        audio: null,
        video: null
      },
      isMicOn: false,
      isCameraOn: false,
      otherUsers: [],
      jitsiConnector: null
    };
  },
  created () {
    // step 1/4: initialize the global JitsiMeetObject
    JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR); 
    JitsiMeetJS.init(initConfigStandard); 

    // TODO: clean-up the event listeners
    JitsiMeetJS.mediaDevices.addEventListener(
      JitsiMeetJS.events.mediaDevices.DEVICE_LIST_CHANGED, 
      (devices) => console.info('current devices', devices)
    );

    // step 2/4: initalize a connection object
    this.jitsiConnector = new JitsiMeetJS.JitsiConnection(null, null, getConnectionConfigNikita("put-room-id-here"));
    const { CONNECTION_ESTABLISHED, CONNECTION_FAILED, CONNECTION_DISCONNECTED } = JitsiMeetJS.events.connection;
    this.jitsiConnector.addEventListener(CONNECTION_ESTABLISHED, this.onConnectionSuccess);
    this.jitsiConnector.addEventListener(CONNECTION_FAILED, this.onConnectionFailed);
    this.jitsiConnector.addEventListener(CONNECTION_DISCONNECTED, this.onDisconnect);
    this.jitsiConnector.connect(); // doesn't seem to return a promise

    // TODO: create a new function that encapsulates the sharing of local tracks
    // TODO: transition the global variable into an instance variable
    // step 3/4: create local tracks and share them FIXME: has race conditions
    // FIXME: createLocalTracks sometimes produces 2 audio tracks and 2 video tracks, instead of 1 each
    JitsiMeetJS.createLocalTracks({ devices: ['audio', 'video'] }) 
      .then(tracks => { // @param tracks Array with JitsiTrack objects
        localTracks = tracks;
        for (const track of localTracks) {
          if (track.getType() === "audio") {
            this.$set(this.myLocalTracks, "audio", track);
          } else {
            this.$set(this.myLocalTracks, "video", track);
          }

          // NOTE: the event listeners for handling local muting is not necessary because of the use of 
          // async await in `toggleMute()` method near the bottom of the file
          //
          // set-up event handlers
          // const { TRACK_MUTE_CHANGED, LOCAL_TRACK_STOPPED } = JitsiMeetJS.events.track; 
          // track.addEventListener(TRACK_MUTE_CHANGED, () => 
          //   console.log('local track muted')
          // );
          // track.addEventListener(LOCAL_TRACK_STOPPED, () => 
          //   console.log('local track stoped')
          // );

          // attach to DOM
          if (track.getType() === 'video') {
            $('#myLocalTracks').append(`<video autoplay='true' id='localVideo' style="width: 300px; height: 300px;"/>`);
            track.attach($(`#localVideo`)[0]);
          } else {
            $('#myLocalTracks').append(`<audio autoplay='true' muted='true' id='localAudio'/>`);
            track.attach($(`#localAudio`)[0]);
          }

          // FIXME: race condition
          if (isJoined) {
            room.addTrack(track);
          }
        }
      })
      .catch(error => {
        throw error;
      });

    // step 4/4: make sure everything will be cleaned-up properly when destroyed
    $(window).bind('beforeunload', this.unload);
    $(window).bind('unload', this.unload);

    // (OPTIONAL): Enable the user to change audio output devices
    // TODO: enable the user to change audio input devices
    if (JitsiMeetJS.mediaDevices.isDeviceChangeAvailable('output')) {
      JitsiMeetJS.mediaDevices.enumerateDevices(devices => {
        const audioOutputDevices = devices.filter(d => d.kind === 'audiooutput');
        if (audioOutputDevices.length > 1) {
          $('#audioOutputSelect').html(
            audioOutputDevices.map(d =>`<option value="${d.deviceId}">${d.label}</option>`).join('\n')
          );
          $('#audioOutputSelectWrapper').show();
        }
      });
    }
  },
  methods: {
    onConnectionSuccess () {
      // question: what happenes to `initJitsiConference` if the conference exists already
      room = this.jitsiConnector.initJitsiConference("conference", conferenceConfigStandard);
      
      // PART 1/2: set up event listeners
      const { conference } = JitsiMeetJS.events; 
      
      room.on(conference.TRACK_ADDED, (track) => {
        if (track.isLocal()) { 
          return;
        }
        const participantID = track.getParticipantId();
        if (!remoteTracks[participantID]) {
          remoteTracks[participantID] = [];
        }
        const idx = remoteTracks[participantID].push(track);

        // set-up event handlers 
        const { TRACK_MUTE_CHANGED, LOCAL_TRACK_STOPPED } = JitsiMeetJS.events.track; // cannot destructure track because its already declared as a variable)
        track.addEventListener(TRACK_MUTE_CHANGED, () => 
          console.log('remote track muted')
        );
        track.addEventListener(LOCAL_TRACK_STOPPED, () => 
          console.log('remote track stoped')
        );
        
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

      // TODO: sometimes tracks are added twice because there are two places that add the local tracks
      // depending on the value of isJoined
      room.on(conference.CONFERENCE_JOINED, () => {
        isJoined = true;
        for (const track of localTracks) {
          room.addTrack(track);
        }
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
      const { CONNECTION_ESTABLISHED, CONNECTION_FAILED, CONNECTION_DISCONNECTED } = JitsiMeetJS.events.connection; 
      this.jitsiConnector.removeEventListener(CONNECTION_ESTABLISHED, this.onConnectionSuccess);
      this.jitsiConnector.removeEventListener(CONNECTION_FAILED, this.onConnectionFailed);
      this.jitsiConnector.removeEventListener(CONNECTION_DISCONNECTED, this.onDisconnect);
    },
    unload () {
      for (const track of localTracks) {
        track.dispose(); 
      }
      room.leave();
      this.jitsiConnector.disconnect();
    },  
    async switchVideo () { 
      isVideo = !isVideo;
      // if (localTracks[1]) {
      //   localTracks[1].dispose();
      //   localTracks.pop();
      // }
      try {
        const tracks = await JitsiMeetJS.createLocalTracks({
          devices: [ isVideo ? 'video' : 'desktop' ]
        }); 
        const { TRACK_MUTE_CHANGED, LOCAL_TRACK_STOPPED } = JitsiMeetJS.events.track; 
        localTracks.push(tracks[0]);
        localTracks[1].addEventListener(TRACK_MUTE_CHANGED, () => 
          console.log('local track muted')
        );
        localTracks[1].addEventListener(LOCAL_TRACK_STOPPED, () => 
          console.log('local track stopped')
        );
        localTracks[1].attach($('#localVideo1')[0]);
        room.addTrack(localTracks[1]);
      } catch (error) {
        console.log(error);
      }
    },
    /**
     * @param {string} selectedDevice the ID of the output device the user selected from the dropdown menu
     * FIXME: Uncaught (in promise) DOMException: Requested device not found
     */
    changeAudioOutput (selectedDevice) {  
      JitsiMeetJS.mediaDevices.setAudioOutputDevice(selectedDevice.value);
    },
    onConnectionFailed (e) {
      console.error("Connection Failed e =", e);
    },
    async toggleMic () {
      console.log("myLocalTracks.audio =", this.myLocalTracks.audio);
      if (this.isMicOn) {
        console.log("muting");
        await this.myLocalTracks.audio.mute(); 
        console.log("muted");
        this.isMicOn = false; 
      } else {
        console.log("unmuting");
        await this.myLocalTracks.audio.unmute(); 
        this.isMicOn = true; 
        console.log("unmuted");
      } 
    },
    toggleCamera () {
      // TODO: use `startStream` and `dispose` to achieve camera on/off
      // console.log("myLocalTracks.video =", this.myLocalTracks.video);
      // if (this.isCameraOn) this.myLocalTracks.video.mute();
      // else this.myLocalTracks.video.unmute(); 
    }
  }
};
</script>
