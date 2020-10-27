<template>
  <div>
    <h1>
      THIS IS THE JITSI AUDIO CONFERENCE ROOM BACKGROUND 
    </h1>
    <p>otherParticipants: {{ otherParticipants }}</p>
    <a href="#" onclick="unload()">Disconnect and unload</a>
    <a href="#" @click="switchVideo()">switchVideo</a>
    <div id="audioOutputSelectWrapper" style="display: none;">
      Change audio output device
      <select id="audioOutputSelect" onchange="changeAudioOutput(this)"></select>
    </div>
  </div>
</template>

<script>
let isVideo = true;

import {
  initConfigStandard,
  getConnectionConfigNikita,
  connectionConfigRelm,
  conferenceConfigStandard,
} from "@/JitsiConfigs.js"; 

export default {
  name: "JitsiAudioConferenceRoom",
  created () {
    // TODO 
  },
  data () {
    return {
      otherParticipants: []
    };
  },
  methods: {
    switchVideo () { 
      console.log("switchVideo ()");
       // eslint-disable-line no-unused-vars
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
    }
  }
}

let connection = null;
let isJoined = false;
let room = null;

let localTracks = [];
const remoteTracks = {};

/**
 * That function is executed when the conference is joined
 */
function onConferenceJoined() {
  console.log("SUCCESSFULLY JOINED CONFERENCE");
  isJoined = true;
  for (let i = 0; i < localTracks.length; i++) {
    room.addTrack(localTracks[i]);
  }
}

/**
 * That function is called when connection is established successfully
 * This is a function so attaching and detaching the event listener is easy
 */
function onConnectionSuccess() {
  console.log("CONNECTION SUCCESS");

  room = connection.initJitsiConference('conference', conferenceConfigStandard);
  console.log("room =", room); 

  setTimeout(() => console.log("after 5 secs, room =", room), 5000)

  const { 
    TRACK_ADDED,
    TRACK_REMOVED, 
    CONFERENCE_JOINED, 
    USER_JOINED, 
    USER_LEFT } = JitsiMeetJS.events.conference; 

  room.on(TRACK_ADDED, (track) => {
    console.log("track added to the conference room");
    if (track.isLocal()) {
      return;
    }
    const participant = track.getParticipantId();

    if (!remoteTracks[participant]) {
      remoteTracks[participant] = [];
    }
    const idx = remoteTracks[participant].push(track);

    const { 
      TRACK_AUDIO_LEVEL_CHANGED, 
      TRACK_MUTE_CHANGED, 
      LOCAL_TRACK_STOPPED, 
      TRACK_AUDIO_OUTPUT_CHANGED } = JitsiMeetJS.events.track; 

    track.addEventListener(TRACK_AUDIO_LEVEL_CHANGED, audioLevel => 
      console.log(`Audio Level remote: ${audioLevel}`)
    );
    track.addEventListener(TRACK_MUTE_CHANGED, () => 
      console.log('remote track muted')
    );
    track.addEventListener(LOCAL_TRACK_STOPPED, () => 
      console.log('remote track stoped')
    );
    track.addEventListener(TRACK_AUDIO_OUTPUT_CHANGED, deviceId => 
      console.log(`track audio output device was changed to ${deviceId}`)
    );
    
    const id = participant + track.getType() + idx;
    if (track.getType() === 'video') {
      $('body').append(`<video autoplay='1' id='${participant}video${idx}' />`);
    } else {
      $('body').append(`<audio autoplay='1' id='${participant}audio${idx}' />`);
    }
    track.attach($(`#${id}`)[0]);
  });

  room.on(TRACK_REMOVED, track => {
    console.log(`track removed!!!${track}`);
  });

  room.on(CONFERENCE_JOINED, () => {
    console.log('conference joined!');
    isJoined = true;
    for (let i = 0; i < localTracks.length; i++) {
      room.addTrack(localTracks[i]);
    }
  });

  room.on(USER_JOINED, id => {
    console.log("user joined, id =", id); 
    // this.otherParticipants.push(id); 
    remoteTracks[id] = [];
  });

  room.on(USER_LEFT, (id) => {
    console.log('user left');
    if (!remoteTracks[id]) {
      return;
    }
    const tracks = remoteTracks[id];
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].detach($(`#${id}${tracks[i].getType()}`));
    }
  });

  const { 
    TRACK_MUTE_CHANGED, 
    DISPLAY_NAME_CHANGED, 
    TRACK_AUDIO_LEVEL_CHANGED, 
    PHONE_NUMBER_CHANGED 
  } = JitsiMeetJS.events.conference; 

  room.on(TRACK_MUTE_CHANGED, track => 
    console.log(`${track.getType()} - ${track.isMuted()}`)
  );
  room.on(TRACK_AUDIO_LEVEL_CHANGED,
    (userID, audioLevel) => console.log(`${userID} - ${audioLevel}`)
  );
  room.join();
}

function onConnectionFailed(e) {
  console.error("Connection Failed e =", e);
}

// TODO: rename to cleanUpEventListeners
function disconnect () {
  console.log('disconnect!');
  connection.removeEventListener(
    JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
    onConnectionSuccess
  );
  connection.removeEventListener(
    JitsiMeetJS.events.connection.CONNECTION_FAILED,
    onConnectionFailed
  );
  connection.removeEventListener(
    JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
    disconnect
  );
}

function unload () {
  for (let i = 0; i < localTracks.length; i++) {
    localTracks[i].dispose();
  }
  room.leave();
  connection.disconnect();
}

/**
 *
 * @param selected
 */
function changeAudioOutput(selected) { // eslint-disable-line no-unused-vars
  JitsiMeetJS.mediaDevices.setAudioOutputDevice(selected.value);
}

/**
 * 
 * While the above section is just a list of helper functions,
 * below is th actual code for establishing the connection. 
 *   Step 1: initConfig with the JitsiMeetJS object
 *   Step 2: initialize a JitsiConnection object
 *   Step 3: use that `JitsiConnection` to connect 
 * 
 */

$(window).bind('beforeunload', unload);
$(window).bind('unload', unload);

// step 1/3: initialize the global JitsiMeetObject
// don't overwhelm the console
JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR); 

JitsiMeetJS.init(initConfigStandard); 

JitsiMeetJS.mediaDevices.addEventListener(
  JitsiMeetJS.events.mediaDevices.DEVICE_LIST_CHANGED, 
  devices => console.info('current devices', devices)
);

console.log("JitsiMeetJS initialized =", JitsiMeetJS);

// step 2/3: initalize a connection object
console.log("initializing connection object");

connection = new JitsiMeetJS.JitsiConnection(null, null, getConnectionConfigNikita("put-room-id-here"));

const { 
  CONNECTION_ESTABLISHED,
  CONNECTION_FAILED,
  CONNECTION_DISCONNECTED
} = JitsiMeetJS.events.connection; 

connection.addEventListener(CONNECTION_ESTABLISHED, onConnectionSuccess);
connection.addEventListener(CONNECTION_FAILED, onConnectionFailed);
connection.addEventListener(CONNECTION_DISCONNECTED, disconnect);

console.log("connection object before `connect` method is called =", connection);

connection.connect(); // is this asynchronous or not? 

console.log("connection object after `connect` method is called =", connection);

console.log("creating local tracks");
JitsiMeetJS.createLocalTracks({ devices: ['audio', 'video'] }) // @param tracks Array with JitsiTrack objects
  .then(tracks => {
    console.log("succesfully created localTracks")
    localTracks = tracks;
    for (let i = 0; i < localTracks.length; i++) {
      const { 
        TRACK_AUDIO_LEVEL_CHANGED, 
        TRACK_MUTE_CHANGED, 
        LOCAL_TRACK_STOPPED, 
        TRACK_AUDIO_OUTPUT_CHANGED 
      } = JitsiMeetJS.events.track; 

      localTracks[i].addEventListener(TRACK_MUTE_CHANGED, () => 
        console.log('local track muted')
      );
      localTracks[i].addEventListener(LOCAL_TRACK_STOPPED, () => 
        console.log('local track stoped')
      );

      // localTracks[i].addEventListener(TRACK_AUDIO_OUTPUT_CHANGED, (deviceId) => 
      //   console.log(`track audio output device was changed to ${deviceId}`)
      // );

      // localTracks[i].addEventListener(TRACK_AUDIO_LEVEL_CHANGED, (audioLevel) => 
      //   console.log(`Audio Level local: ${audioLevel}`)
      // );

      if (localTracks[i].getType() === 'video') {
        $('body').append(`<video autoplay='1' id='localVideo${i}' style="width: 300px; height: 300px;"/>`);
        localTracks[i].attach($(`#localVideo${i}`)[0]);
      } else {
        $('body').append(`<audio autoplay='1' muted='true' id='localAudio${i}' />`);
        localTracks[i].attach($(`#localAudio${i}`)[0]);
      }
      if (isJoined) {
        room.addTrack(localTracks[i]);
      }
    }
  })
  .catch(error => {
    throw error;
  });

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
</script>
