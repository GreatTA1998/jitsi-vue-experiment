/**
 * For the full configuration example, see: https://meet.jit.si/config.js 
 * https://www.thecodingartist.com/blogs/creating-custom-jitsi-ui-using-vuejs/
 * 
 * There are 3 types of configs: 
 *   1. initConfig := sort of a global config for the entire JitsiMeetJS object
 *      Example: 
*         JitsiMeetJS.init(initConfig);
 * 
 *   2. connectionConfig := a more specific config for the type of connection to be established
 *      Example: 
 *         connection = new JitsiMeetJS.JitsiConnection(null, null, conectionConfig);
 *         Note that the first two parameters: `appId` and `token` are the optional.
 *   
 *   3. conferenceConfig := a more specific config for the type of conference room to be created 
 *       e.g. what types of connections would it allow, would new participants be muted by default e.g.
 *      Example:
 *         JitsiMeetJS.init(conferenceConfig); 
 */

// Nikita := a Russian developer who somehow figured out the correct config options for his/her app
// Relm := an open world game that implements Jitsi for audio-video communication
export const getConnectionConfigNikita = roomName => ({
  hosts: {
    domain: 'meet.jit.si',
    muc: 'conference.meet.jit.si',
    focus: 'focus.meet.jit.si'
  },
  serviceUrl: 'https://meet.jit.si/http-bind?room=' + roomName,
  clientNode: 'http://jitsi.org/jitsimeet',
});

export const initConfigStandard = {
  disableAudioLevels: true
};

export const conferenceConfigStandard = {
  openBridgeChannel: 'websocket'
};

export const connectionConfigRelm = {
  hosts: {
    domain: 'meet.jit.si',
    muc: 'conference.meet.jit.si',
    focus: 'focus.meet.jit.si',
  },
  externalConnectUrl: 'https://meet.jit.si/http-pre-bind',
  enableP2P: true,
  p2p: {
    enabled: true,
    preferH264: true,
    disableH264: true,
    useStunTurn: true,
  },
  useStunTurn: true,
  // DEPRECATED: bosh: `https://meet.jit.si/http-bind?room=${relmContext.room}`,
  websocket: 'wss://meet.jit.si/xmpp-websocket',
  clientNode: 'http://jitsi.org/jitsimeet'
};

// alternative config: https://community.jitsi.org/t/how-to-enter-video-and-audio-off/72817/4

// BELOW ARE SOME MODIFIED CODE TAKEN FROM Example.js from lib-jisti-meet's cloned repository
// const options = {

//     // P2P STUN SERVERS

//     // POST file://jitsi-meet.example.com/http-bind error failed
//     // therefore it tries to connect to the serviceUrl. Can someone Explain what the 
//     // serviceUrl does?

//     // nowhere does it explain what the properties mean
//     hosts: {
//         domain: 'jitsi-meet.example.com',
//         muc: 'conference.jitsi-meet.example.com' // FIXME: use XEP-0030
//     },

//     // https://meet.jit.si/http-bind   

//     // serviceUrl: "//jitsi-meet.example.com/http-bind",
//     serviceUrl: "https://meet.jit.si/http-bind"

//     // DEPRECATED
//     // bosh: '//jitsi-meet.example.com/http-bind', // FIXME: use xep-0156 for that
    
//     // PAGE NOT FOUND
//     // The name of client node advertised in XEP-0115 'c' stanza
//     // clientNode: 'http://jitsi.org/jitsimeet'
// };