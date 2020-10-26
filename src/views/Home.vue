<template>
  <div class="home">
    <!-- <img alt="Vue logo" src="../assets/logo.png"> -->
    <!-- <HelloWorld msg="Welcome to Your Vue.js App"/> -->
    <!-- <a href="#" onclick="unload()">Unload</a>
    <a href="#" onclick="switchVideo()">switchVideo</a>
    <div id="audioOutputSelectWrapper" style="display: none;">
        Change audio output device
        <select id="audioOutputSelect" onchange="changeAudioOutput(this)"></select>
    </div> -->
    <JitsiAudioConferenceRoom/>
  </div>
</template>

<script>
import JitsiAudioConferenceRoom from "@/components/JitsiAudioConferenceRoom.vue";

export default {
  name: 'Home',
  components: {
    JitsiAudioConferenceRoom
  }
}
</script>
