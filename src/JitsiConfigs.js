/**
 * For the full configuration example, see: https://meet.jit.si/config.js 
 * https://www.thecodingartist.com/blogs/creating-custom-jitsi-ui-using-vuejs/
 * 
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
export const getConnectionConfigNikita = (roomName) => ({
  hosts: {
    domain: 'meet.jit.si',
    muc: 'conference.meet.jit.si',
    focus: 'focus.meet.jit.si'
  },
  serviceUrl: 'https://meet.jit.si/http-bind?room=' + roomName,
  clientNode: 'http://jitsi.org/jitsimeet',
  enableLipSync: false
});

export const initConfigStandard = {
  disableAudioLevels: true,
  enableLipSync: false
};

export const conferenceConfigStandard = {
  openBridgeChannel: 'websocket',
  enableLipSync: false
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

var subdomain = "";
if (subdomain) {
    subdomain = subdomain.substr(0,subdomain.length-1).split('.').join('_').toLowerCase() + '.';
}
export const fullConfig = {
    serviceUrl: 'https://meet.jit.si/http-bind?room=' + "<put-future-room-id-here>",
    clientNode: 'http://jitsi.org/jitsimeet',

    hosts: {
        domain: 'meet.jit.si',
        muc: 'conference.'+subdomain+'meet.jit.si', // FIXME: use XEP-0030
        focus: 'focus.meet.jit.si',
    },
    disableSimulcast: false,
    enableRemb: true,
    enableTcc: true,
    resolution: 720,
    constraints: {
        video: {
            height: {
                ideal: 720,
                max: 720,
                min: 180
            },
            width: {
                ideal: 1280,
                max: 1280,
                min: 320
            }
        }
    },
    enableInsecureRoomNameWarning: true,
    externalConnectUrl: '//meet.jit.si/http-pre-bind',
analytics: {
            amplitudeAPPKey: "fafdba4c3b47fe5f151060ca37f02d2f",
        rtcstatsEnabled: true,
    rtcstatsEndpoint: "wss://rtcstats-server.jitsi.net/",
    rtcstatsPollInterval: 2000,
                    whiteListedEvents: [ 'conference.joined', 'page.reload.scheduled', 'rejoined', 'transport.stats', 'rtcstats.trace.onclose' ],
    },
    enableP2P: true, // flag to control P2P connections
    // New P2P options
    p2p: {
        enabled: true,
        disableH264: true,
        useStunTurn: true // use XEP-0215 to fetch STUN and TURN servers for the P2P connection
    },
    useStunTurn: true, // use XEP-0215 to fetch TURN servers for the JVB connection
    useTurnUdp: false,
    bosh: '//meet.jit.si/http-bind', // FIXME: use xep-0156 for that
    websocket: 'wss://meet.jit.si/xmpp-websocket', // FIXME: use xep-0156 for that

    clientNode: 'http://jitsi.org/jitsimeet', // The name of client node advertised in XEP-0115 'c' stanza
    //deprecated desktop sharing settings, included only because older version of jitsi-meet require them
    desktopSharing: 'ext', // Desktop sharing method. Can be set to 'ext', 'webrtc' or false to disable.
    chromeExtensionId: 'kglhbbefdnlheedjiejgomgmfplipfeb', // Id of desktop streamer Chrome extension
    desktopSharingSources: ['screen', 'window'],
    googleApiApplicationClientID: "39065779381-bbhnkrgibtf4p0j9ne5vsq7bm49t1tlf.apps.googleusercontent.com",
    microsoftApiApplicationClientID: "00000000-0000-0000-0000-000040240063",
    enableCalendarIntegration: true,
    //new desktop sharing settings
    desktopSharingChromeExtId: 'kglhbbefdnlheedjiejgomgmfplipfeb', // Id of desktop streamer Chrome extension
    desktopSharingChromeSources: ['screen', 'window', 'tab'],
    useRoomAsSharedDocumentName: false,
    enableLipSync: false,
    disableRtx: false, // Enables RTX everywhere
    enableScreenshotCapture: false,
    openBridgeChannel: 'websocket', // One of true, 'datachannel', or 'websocket'
    channelLastN: 20, // The default value of the channel attribute last-n.
    lastNLimits: {
        5: 20,
        30: 15,
        50: 10,
        70: 5,
        90: 2
    },
    videoQuality: {
            maxBitratesVideo: {
            low: 200000,
            standard: 500000,
            high: 1500000
        },
            },
    startBitrate: "800",
    disableAudioLevels: false,
    disableSuspendVideo: true,
    stereo: false,
    forceJVB121Ratio:  -1,
    enableTalkWhileMuted: true,

    enableNoAudioDetection: true,

    enableNoisyMicDetection: true,

    enableClosePage: true,

    disableLocalVideoFlip: false,

    hiddenDomain: 'recorder.meet.jit.si',
    dropbox: {
        appKey: '3v5iyto7n7az02w'
    },


    transcribingEnabled: false,
    enableRecording: true,
    liveStreamingEnabled: true,
    fileRecordingsEnabled: true,
    fileRecordingsServiceEnabled: false,
    fileRecordingsServiceSharingEnabled: false,
    requireDisplayName: false,
    enableWelcomePage: true,
    isBrand: false,
// To enable sending statistics to callstats.io you should provide Applicaiton ID and Secret.
    callStatsID: "574005334",//Application ID for callstats.io API
    callStatsSecret: "sBRvEnCkjJMnkhNy2ufsEaUt1MdMPxR2WQqfO+jB6Lk=",//Secret for callstats.io API
    callStatsApplicationLogsDisabled: true,
    callStatsCustomScriptUrl: "https://api.callstats.io/static/callstats-ws.min.js",
    dialInNumbersUrl: 'https://api.jitsi.net/phoneNumberList',
    dialInConfCodeUrl:  'https://api.jitsi.net/conferenceMapper',

    dialOutCodesUrl:  'https://api.jitsi.net/countrycodes',
    dialOutAuthUrl: 'https://api.jitsi.net/authorizephone',
    peopleSearchUrl: 'https://api.jitsi.net/directorySearch',
    inviteServiceUrl: 'https://api.jitsi.net/conferenceInvite',
    inviteServiceCallFlowsUrl: 'https://api.jitsi.net/conferenceinvitecallflows',
    peopleSearchQueryTypes: ['user','conferenceRooms'],
    startAudioMuted: 9,
    startVideoMuted: 9,
    enableUserRolesBasedOnToken: false,
    enableLayerSuspension: true,
feedbackPercentage: 0,
    deploymentUrls: {
        userDocumentationURL: "https://jitsi.github.io/handbook/help",
    },
    chromeExtensionBanner: {
        url: "https://chrome.google.com/webstore/detail/jitsi-meetings/kglhbbefdnlheedjiejgomgmfplipfeb",
        chromeExtensionsInfo: [{"path": "jitsi-logo-48x48.png", "id": "kglhbbefdnlheedjiejgomgmfplipfeb"}]
    },
    prejoinPageEnabled: true,
    enableInsecureRoomNameWarning: true,
    hepopAnalyticsUrl: "",
    hepopAnalyticsEvent: {
        product: "lib-jitsi-meet",
        subproduct: "meet-jit-si",
        name: "jitsi.page.load.failed",
        action: "page.load.failed",
        actionSubject: "page.load",
        type: "page.load.failed",
        source: "page.load",
        attributes: {
            type: "operational",
            source: 'page.load'
        },
        server: "meet.jit.si"
    },
    deploymentInfo: {
        environment: 'meet-jit-si',
        envType: 'prod',
        releaseNumber: '1053',
        shard: 'meet-jit-si-ap-south-1b-s29',
        region: 'ap-south-1',
        userRegion: 'ap-south-1',
        crossRegion: (!'ap-south-1' || 'ap-south-1' === 'ap-south-1') ? 0 : 1
    },
    e2eping: {
        pingInterval: -1
    },
    abTesting: {
    },
    testing: {
            callStatsThreshold: 1, // % of users that will have callStats enabled.
            capScreenshareBitrate: 1,
        octo: {
            probability: 1
        }
    }
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