import { ref, Transition } from "../deps/vue.js";

export default {
  components: { Transition },
  props: {
    started: { default: false },
    opacity: { default: 1 },
    message: {
      default: `Please allow access to your camera to be a
  public audience member in our venue`,
    },
  },
  setup(props, { emit }) {
    const hasStarted = ref(props.started);
    const onStart = () => {
      hasStarted.value = true;
      emit("start");
    };
    const onStop = () => {
      hasStarted.value = false;
      emit("stop");
    };
    return { hasStarted, onStart, onStop };
  },
  template: `
  <slot />
  <transition name="fade">
  <div
    v-if="!hasStarted"
    style="
      position: absolute;
      top: 0;
      right: 0;
      left: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0 32px;
    "
  >
    <div>
      <p>
        {{ message }}
      </p>
      <button @click="onStart">Start camera</button>
    </div>
  </div>
  </transition>
  <div
    v-if="hasStarted"
    style="
      position: absolute;
      right: 0;
      left: 0;
      bottom: 16px;
      text-align: center;
    "
  >
    <button @click="onStop">Stop my camera</button>
  </div>
  `,
};
