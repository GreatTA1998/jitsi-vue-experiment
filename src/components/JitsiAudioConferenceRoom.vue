<template>
  <div>
    <h1>JITSI AUDIO CONFERENCE PLAYGROUND</h1>
    <p>otherParticipants: {{ otherParticipants }}</p>
    <button @click="unload()">Unload</button>
    <button @click="switchVideo()">Switch video</button>
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
 * TODO: 
 *   1. Make the `connection` object an instance variable i.e `this.connection` rather than a global variable 
 *   2. Now that everything is translated into Vue, display the state correctly e.g. muted, video, participants
 *   3. Test extensively and deploy onto a dummy Firebase website and test in isolation
 *   4. Only then, integrate into Explain, then test separately 
 *   5. I estimate that it'll take 1 week, but after that the cost of running Explain will be free
 * 
 * Questions:
 *   How to clean up the conference room? Sometimes, there will be lots of dead tracks in the room and the participants didn't "leave". 
 *   How do I prevent ghosts from entering? 
 * 
 *   How can I get a reliable answer on how the reliability of Jitsi will change over the years? 
 * 
 * @see https://github.com/jitsi/lib-jitsi-meet/blob/master/doc/API.md
 * 
 */
import { initConfigStandard, getConnectionConfigNikita, conferenceConfigStandard } from "@/JitsiConfigs.js"; 

let isVideo = true;
let connection = null;
let isJoined = false;
let room = null;
let localTracks = [];
const remoteTracks = {};

export default {
  name: "JitsiAudioConferenceRoom",
  /**
   * Connect to the audio conference room:
   *   Step 1: initConfig with the JitsiMeetJS object
   *   Step 2: initialize a JitsiConnection object
   *   Step 3: use that `JitsiConnection` to connect 
   *   Step 4: make sure when everything is cleaned up properly when destroyed
   */
  created () {
    // step 1/4: initialize the global JitsiMeetObject
    JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR); 
    JitsiMeetJS.init(initConfigStandard); 
    JitsiMeetJS.mediaDevices.addEventListener(
      JitsiMeetJS.events.mediaDevices.DEVICE_LIST_CHANGED, 
      devices => console.info('current devices', devices)
    );

    // step 2/4: initalize a connection object
    connection = new JitsiMeetJS.JitsiConnection(null, null, getConnectionConfigNikita("put-room-id-here"));
    const { events } = JitsiMeetJS; 
    connection.addEventListener(events.connection.CONNECTION_ESTABLISHED, this.onConnectionSuccess);
    connection.addEventListener(events.connection.CONNECTION_FAILED, this.onConnectionFailed);
    connection.addEventListener(events.connection.CONNECTION_DISCONNECTED, this.onDisconnect);
    connection.connect(); // doesn't seem to return a promise

    // step 3/4: create local tracks and share them FIXME: has race conditions
    JitsiMeetJS.createLocalTracks({ devices: ['audio', 'video'] }) // @param tracks Array with JitsiTrack objects
      .then(tracks => {
        localTracks = tracks;
        for (let i = 0; i < localTracks.length; i++) {
          // set-up event handlers
          const { track } = JitsiMeetJS.events; 
          localTracks[i].addEventListener(track.TRACK_MUTE_CHANGED, () => 
            console.log('local track muted')
          );
          localTracks[i].addEventListener(track.LOCAL_TRACK_STOPPED, () => 
            console.log('local track stoped')
          );

          // attach to DOM
          if (localTracks[i].getType() === 'video') {
            $('body').append(`<video autoplay='1' id='localVideo${i}' style="width: 300px; height: 300px;"/>`);
            localTracks[i].attach($(`#localVideo${i}`)[0]);
          } else {
            $('body').append(`<audio autoplay='1' muted='true' id='localAudio${i}' />`);
            localTracks[i].attach($(`#localAudio${i}`)[0]);
          }

          // FIXME: race condition
          if (isJoined) {
            room.addTrack(localTracks[i]);
          }
        }
      })
      .catch(error => {
        throw error;
      });

    // enable the user to change audio output devices
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

    // step 4/4: make sure everything will be cleaned-up properly when destroyed
    $(window).bind('beforeunload', this.unload);
    $(window).bind('unload', this.unload);
  },
  data () {
    return {
      otherParticipants: []
    };
  },
  methods: {
    onConnectionSuccess () {
      room = connection.initJitsiConference('conference', conferenceConfigStandard);
      
      const { conference } = JitsiMeetJS.events; 
      
      room.on(conference.TRACK_ADDED, (track) => {
        if (track.isLocal()) { 
          return;
        }
        const participant = track.getParticipantId();
        if (!remoteTracks[participant]) {
          remoteTracks[participant] = [];
        }
        const idx = remoteTracks[participant].push(track);

        // set-up event handlers
        const { events } = JitsiMeetJS; 
        track.addEventListener(events.track.TRACK_AUDIO_LEVEL_CHANGED, audioLevel => 
          console.log(`Audio Level remote: ${audioLevel}`)
        );
        track.addEventListener(events.track.TRACK_MUTE_CHANGED, () => 
          console.log('remote track muted')
        );
        track.addEventListener(events.track.LOCAL_TRACK_STOPPED, () => 
          console.log('remote track stoped')
        );
        
        const id = participant + track.getType() + idx;
        if (track.getType() === 'video') {
          $('body').append(`
            <p>participantID ${participant}'s VIDEO</p>
            <video autoplay='1' id='${participant}video${idx}' />
          `);
        } else {
          $('body').append(`
            <p>participantID ${participant}'s AUDIO</p>
            <audio autoplay='1' id='${participant}audio${idx}' />
          `);
        }
        track.attach($(`#${id}`)[0]);
      });

      room.on(conference.TRACK_REMOVED, track => {
        console.log(`The track ${track} was removed`);
      });

      // TODO: sometimes tracks are added twice because there are two places that add the local tracks
      // depending on the value of isJoined
      room.on(conference.CONFERENCE_JOINED, () => {
        isJoined = true;
        for (let i = 0; i < localTracks.length; i++) {
          room.addTrack(localTracks[i]);
        }
      });

      room.on(conference.USER_JOINED, (id) => {
        console.log("user joined, id =", id); 
        // this.otherParticipants.push(id); 
        remoteTracks[id] = [];
      });

      room.on(conference.USER_LEFT, (id) => {
        console.log('USER_LEFT event fired');
        if (!remoteTracks[id]) {
          console.log("EARLY EXIT");
          return;
        }
        const tracks = remoteTracks[id];

        // FIXME: the detach() function throws errors
        for (let i = 0; i < tracks.length; i++) {
          console.log("about to throw the errors here");
          console.log("HTML container =", $(`#${id}${tracks[i].getType()}`));
          console.log("track =", tracks[i]);
          tracks[i].detach($(`#${id}${tracks[i].getType()}`));
        }
        console.log("Finished handling USER_LEFT event")
      });

      room.on(conference.TRACK_MUTE_CHANGED, track => 
        // TODO: mute that participant
        console.log(`${track.getType()} - ${track.isMuted()}`)
      );
      room.join();
    },
    onDisconnect () {
      const { events } = JitsiMeetJS; 
      connection.removeEventListener(events.connection.CONNECTION_ESTABLISHED, this.onConnectionSuccess);
      connection.removeEventListener(events.connection.CONNECTION_FAILED, this.onConnectionFailed);
      connection.removeEventListener(events.connection.CONNECTION_DISCONNECTED, this.onDisconnect);
    },
    unload () {
      for (let i = 0; i < localTracks.length; i++) {
        localTracks[i].dispose();
      }
      room.leave();
      connection.disconnect();
    },  
    switchVideo () { 
      console.log("switchVideo ()");
      isVideo = !isVideo;
      if (localTracks[1]) {
        localTracks[1].dispose();
        localTracks.pop();
      }
      JitsiMeetJS.createLocalTracks({
        devices: [ isVideo ? 'video' : 'desktop' ]
      })
        .then(tracks => {
          const { TRACK_MUTE_CHANGED, LOCAL_TRACK_STOPPED } = JitsiMeetJS.events.track; 
          localTracks.push(tracks[0]);
          localTracks[1].addEventListener(TRACK_MUTE_CHANGED, () => 
            console.log('local track muted')
          );
          localTracks[1].addEventListener(LOCAL_TRACK_STOPPED, () => 
            console.log('local track stoped')
          );
          localTracks[1].attach($('#localVideo1')[0]);
          room.addTrack(localTracks[1]);
        })
        .catch(error => console.log(error));
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
    }
  }
};
</script>
