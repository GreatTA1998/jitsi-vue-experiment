<template>
  <div class="home">
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
