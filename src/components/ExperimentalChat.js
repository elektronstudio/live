import { ref, onMounted } from "../deps/vue.js";
import {
  useLocalstorage,
  useScrollToBottom,
  useTextarea,
} from "../hooks/index.js";
import {
  safeJsonParse,
  randomId,
  any,
  adjectives,
  animals,
} from "../utils/index.js";

import ChatMessage from "./ChatMessage.js";
import { chatUrl } from "../config/index.js";

export default {
  components: { ChatMessage },
  props: ["id"],
  setup(props) {
    const userId = useLocalstorage("elektron_user_id", randomId());
    const userName = useLocalstorage(
      "elektron_user_name",
      `${any(adjectives)} ${any(animals)}`
    );
    const messages = useLocalstorage("elektron_messages", []);
    const newMessage = ref("");

    const socket = new WebSocket(chatUrl);

    socket.onmessage = ({ data }) => {
      const incomingMessage = safeJsonParse(data);
      if (
        incomingMessage &&
        incomingMessage.type === "message" &&
        incomingMessage.channel === props.id
      ) {
        messages.value = [...messages.value, incomingMessage];
      }
    };

    const onNewMessage = () => {
      const outgoingMessage = {
        id: randomId(),
        channel: props.id,
        type: "message",
        value: newMessage.value,
        from: {
          type: "user",
          id: userId.value,
          name: userName.value,
        },
        to: {
          type: "all",
        },
        datetime: new Date().toISOString(),
      };
      socket.send(JSON.stringify(outgoingMessage));
      newMessage.value = "";
    };

    const onNameChange = () => {
      const newName = window.prompt("Enter your name", userName.value);
      if (newName) {
        userName.value = newName;
      }
    };

    const textareaEl = useTextarea(onNewMessage);
    const scrollEl = useScrollToBottom();

    return {
      messages,
      newMessage,
      onNewMessage,
      userId,
      userName,
      onNameChange,
      scrollEl,
      textareaEl,
    };
  },
  template: `
  <div style="
    display: grid;
    grid-template-rows: 1fr auto;
    height: 100%;
    max-height: 50vh;
    gap: 8px;
  ">
    <div
      ref="scrollEl"
      style="
        height: 100%;
        overflow: scroll;
        background: rgba(20, 20, 20, 0.2);
        padding: 16px;
      ">
      <div v-for="message in messages" style="margin-bottom: 24px" >
        <chat-message :message="message" :userId="userId">
      </div>
    </div>
    <div>
      <div style="
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 4px;
      ">
        <textarea ref="textareaEl" v-model="newMessage" ></textarea>
        <button @click="onNewMessage">Send</button>
      </div>
    <div style="font-size: 13px; margin-bottom: 8px; opacity: 0.7">
      Sending message as {{ userName }}. <a href="" @click.prevent="onNameChange">Change</a>
    </div>
  </div>  
  `,
};

// Press Enter for sending, Shift+Enter for adding a new line