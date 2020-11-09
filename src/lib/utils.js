import { ref, onMounted, onUnmounted, computed, isRef } from "../deps/vue.js";
import { postscribe } from "../deps/postscribe.js";
import { TurndownService } from "../deps/turndown.js";
import { marked } from "../deps/marked.js";
import { ReconnectingWebsocket } from "../deps/reconnecting-websocket.js";

import {
  compareDesc,
  differenceInHours,
  formatDistanceToNowStrict,
} from "../deps/date-fns.js";
import { zonedTimeToUtc, utcToZonedTime, format } from "../deps/date-fns-tz.js";
import mitt from "https://cdn.skypack.dev/pin/mitt@v2.1.0-kXa6tLmCOzfamk79MfN2/min/mitt.js";

import {
  openviduUrl,
  openviduUsername,
  openviduPassword,
  chatUrl,
} from "../../config.js";

// Fit

// https://github.com/fregante/intrinsic-scale/blob/master/index.js
export const fit = (parentWidth, parentHeight, childWidth, childHeight) => {
  const doRatio = childWidth / childHeight;
  const cRatio = parentWidth / parentHeight;
  let width = parentWidth;
  let height = parentHeight;

  if (doRatio < cRatio) {
    height = width / doRatio;
  } else {
    width = height * doRatio;
  }

  return {
    x: (parentWidth - width) / 2,
    y: (parentHeight - height) / 2,
    width,
    height,
  };
};

// Debounce

export function debounce(fn, timeout) {
  let t;
  return function () {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, arguments), timeout);
  };
}

// ID

export const uuidv4 = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Json utils

export const safeJsonParse = (str) => {
  try {
    return JSON.parse(str);
  } catch (err) {
    return null;
  }
};

export const safeStringify = (obj, indent = 2) => {
  let cache = [];
  const retVal = JSON.stringify(
    obj,
    (key, value) =>
      typeof value === "object" && value !== null
        ? cache.includes(value)
          ? undefined
          : cache.push(value) && value
        : value,
    indent
  );
  cache = null;
  return retVal;
};

// Date utils

const timezone = "Europe/Tallinn";

export const createDate = (str) => utcToZonedTime(str, timezone);

export const createNow = () =>
  format(utcToZonedTime(new Date(), timezone), "yyyy-MM-dd HH:mm:ss");

const isDatetime = (str) => String(str).match(/:/g);

const getDifference = (start, end) => {
  const diffStart = differenceInHours(
    createDate(start),
    createDate(new Date())
  );
  const diffEnd = differenceInHours(createDate(end), createDate(new Date()));
  if (isDatetime(start) && isDatetime(end)) {
    if (diffStart < 0 && diffEnd >= 0) {
      return { diff: "now", diffStart, diffEnd };
    } else if (diffStart >= 0 && diffStart <= 3) {
      return { diff: "soon", diffStart, diffEnd };
    } else if (diffStart >= 0 && diffStart > 3) {
      return { diff: "future", diffStart, diffEnd };
    } else {
      return { diff: "past", diffStart, diffEnd };
    }
  } else {
    // No time specified
    if (diffStart < 0) {
      return { diff: "past", diffStart, diffEnd };
    } else {
      return { diff: "future", diffStart, diffEnd };
    }
  }
};

export const formatDate = (str) => {
  if (isDatetime(str)) {
    return format(new Date(str), "d. MMM y HH:mm");
  } else {
    return format(new Date(str), "d. MMM y");
  }
};

export const formatAgo = (event) => {
  if (event.diff === "future" || event.diff === "soon") {
    return `Starts in ${formatDistanceToNowStrict(new Date(event.start))}`;
  }
  if (event.diff === "now") {
    return `Started ${formatDistanceToNowStrict(new Date(event.start))} ago`;
  }
  return `Ended ${formatDistanceToNowStrict(new Date(event.end))} ago`;
};

// Content utils

const hasTags = (str) => !!str.match(/(<([^>]+)>)/gi);

const stripTags = (str) => str.replace(/(<([^>]+)>)/gi, "");

const htmlDecode = (str) => {
  const doc = new DOMParser().parseFromString(str, "text/html");
  return doc.documentElement.textContent;
};

const findMetadata = (str, key) => {
  const pattern = `\n\r?(${key}:\s?)(.*)`;
  const matches = str.match(pattern);
  if (matches && matches[2]) {
    return htmlDecode(stripTags(marked(matches[2])).trim())
      .replace("/_", "_")
      .replace(/\\_/g, "_");
  }
  return "";
};

const turndown = new TurndownService();

export const parseEvent = (event) => {
  const summary = event.summary ? event.summary.trim() : "";
  const start = event.start.date
    ? event.start.date
    : event.start.dateTime
    ? event.start.dateTime
    : "";
  const end = event.end.date
    ? event.end.date
    : event.end.dateTime
    ? event.end.dateTime
    : "";

  const rawDescription = event.description || "";

  let description = "";
  let metadataDescription = "";

  if (hasTags(rawDescription)) {
    const markdown = turndown.turndown(rawDescription);
    description = marked(markdown.split("---")[0], { breaks: true });
    metadataDescription = markdown;
  } else {
    description = marked(rawDescription.split("---")[0], { breaks: true });
    metadataDescription = rawDescription;
  }

  const id = findMetadata(metadataDescription, "id");
  const youtube = findMetadata(metadataDescription, "youtube");
  const image = findMetadata(metadataDescription, "image");
  const color = findMetadata(metadataDescription, "color");
  const experimental = !!findMetadata(metadataDescription, "experimental");

  const diff = getDifference(start, end);

  return {
    id,
    youtube,
    image,
    color,
    experimental,
    description,
    summary,
    description,
    start,
    end,
    ...diff,
  };
};

export const fetchEvents = (url) => {
  return fetch(url)
    .then((res) => res.json())
    .then(({ items }) =>
      items
        .map(parseEvent)
        .sort((a, b) => compareDesc(createDate(a.start), createDate(b.start)))
    );
};

// Fetch

export const fetchAuth = ({
  url,
  payload = null,
  userName,
  password,
  method = "POST",
}) => {
  let headers = new Headers();
  headers.set("content-type", "application/json");
  if (userName && password) {
    headers.set("Authorization", "Basic " + btoa(`${userName}:${password}`));
  }
  return new Promise((resolve, reject) => {
    fetch(url, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : null,
    }).then((res) => {
      if (res.status === 409) {
        return resolve(payload);
      } else {
        return resolve(res.json());
      }
    });
  });
};

export const getToken = (id) =>
  fetchAuth({
    url: `${openviduUrl}/api/sessions`,
    payload: { customSessionId: id },
    userName: openviduUsername,
    password: openviduPassword,
  }).then(() =>
    fetchAuth({
      url: `${openviduUrl}/api/tokens`,
      payload: { session: id },
      userName: openviduUsername,
      password: openviduPassword,
    })
  );

// Arrays

export const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);

export const any = (arr) => shuffle(arr)[0];

export const uniqueArray = (arr) => [...new Set(arr)];

export const uniqueCollection = (arr, key) => {
  const result = [];
  const map = new Map();
  for (const item of arr) {
    if (!map.has(item[key])) {
      map.set(item[key], true);
      result.push(item);
    }
  }
  return result;
};

export const removeFromArray = (arr, callback) => {
  const index = arr.findIndex(callback);
  if (index > -1) {
    return arr.splice(index, 1);
  }
};

export const upsertArray = (arr, callback, newItem) => {
  const index = arr.findIndex(callback);
  if (index > -1) {
    return arr.splice(index, 1, newItem);
  } else {
    return [...arr, newItem];
  }
};

// Strings

export const randomId = (length = 16) => {
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  return shuffle(letters).slice(0, length).join("");
};

// Time

export const useSetInterval = (callback, nth, condition, timeout) => {
  let a = 0;
  const interval = ref(null);
  onMounted(() => {
    interval.value = setInterval(() => {
      a = a >= nth.value - 1 ? 0 : a + 1;
      if (a === 0 && condition.value) {
        callback();
      }
    }, timeout);
  });
  onUnmounted(() => {
    if (interval.value) {
      clearInterval(interval.value);
    }
  });
  return interval;
};

function Events() {
  return {
    all: (n = n || new Map()),
    on: function (t, e) {
      var i = n.get(t);
      (i && i.push(e)) || n.set(t, [e]);
    },
    emit: function (t, e) {
      (n.get(t) || []).slice().map(function (n) {
        n(e);
      }),
        (n.get("*") || []).slice().map(function (n) {
          n(t, e);
        });
    },
  };
}

export const events = mitt();

// Websockets

export const socket = new ReconnectingWebsocket(chatUrl);

// Create message

export const createMessage = (message) => {
  return {
    id: randomId(),
    datetime: new Date().toISOString(),
    type: "",
    channel: "",
    userId: "",
    userName: "",
    value: "",
    ...message,
  };
};

// Sample data

export const adjectives = [
  "Active",
  "Adored",
  "Adulated",
  "Adventurous",
  "Affectionate",
  "Amused",
  "Amusing",
  "Antique",
  "Appreciated",
  "Archaic",
  "Ardent",
  "Astonished",
  "Audacious",
  "Awestruck",
  "Beaming",
  "Bewildered",
  "Bewitching",
  "Blissful",
  "Booming",
  "Bouncy",
  "Breathtaking",
  "Bright",
  "Brilliant",
  "Bubbling",
  "Calm",
  "Calming",
  "Celestial",
  "Charming",
  "Cheerful",
  "Cherished",
  "Chilled",
  "Comical",
  "Companionable",
  "Confident",
  "Courage",
  "Dancing",
  "Dazzling",
  "Delicate",
  "Delightful",
  "Demented",
  "Desirable",
  "Determined",
  "Devoted",
  "Dominant",
  "Elegant",
  "Enchanted",
  "Energetic",
  "Enthusiastic",
  "Ethereal",
  "Exaggerated",
  "Exalted",
  "Expectant",
  "Expressive",
  "Exuberant",
  "Faint",
  "Fantastical",
  "Favorable",
  "Feverish",
  "Fiery",
  "Floating",
  "Flying",
  "Folksy",
  "Fond",
  "Forgiven",
  "Forgiving",
  "Frenetic",
  "Funny",
  "Furry",
  "Galloping",
  "Gaping",
  "Gentle",
  "Giddy",
  "Glacial",
  "Gladness",
  "Gleaming",
  "Gleeful",
  "Gorgeous",
  "Graceful",
  "Grateful",
  "Halting",
  "Happy",
  "Haunting",
  "Heavenly",
  "Hidden",
  "Honor",
  "Hopeful",
  "Hopping",
  "Humble",
  "Hushed",
  "Hypnotic",
  "Illuminated",
  "Immense",
  "Imperious",
  "Impudent",
  "Innocent",
  "Inspired",
  "Intimate",
  "Intrepid",
  "Jagged",
  "Joking",
  "Joyful",
  "Jubilant",
  "Kindly",
  "Languid",
  "Laughable",
  "Lighthearted",
  "Limping",
  "Linear",
  "Lively",
  "Lofty",
  "Lovely",
  "Lulling",
  "Luminescent",
  "Lush",
  "Luxurious",
  "Magical",
  "Maniacal",
  "Manliness",
  "March-like",
  "Masterful",
  "Merciful",
  "Merry",
  "Mischievous",
  "Misty",
  "Modest",
  "Moonlit",
  "Mysterious",
  "Mystical",
  "Mythological",
  "Nebulous",
  "Nostalgic",
  "Overstated",
  "Partying",
  "Perplexed",
  "Playful",
  "Pleasurable",
  "Poignant",
  "Portentous",
  "Posh",
  "Powerful",
  "Pretty",
  "Prideful",
  "Princesslike",
  "Proud",
  "Puzzled",
  "Queenly",
  "Questing",
  "Quiet",
  "Ragged",
  "Rejoicing",
  "Relaxed",
  "Reserved",
  "Resolute",
  "Ridiculous",
  "Ritualistic",
  "Running",
  "Scampering",
  "Sensitive",
  "Serene",
  "Shaking",
  "Shining",
  "Silky",
  "Silly",
  "Simple",
  "Singing",
  "Skipping",
  "Smooth",
  "Sneaky",
  "Soaring",
  "Sophisticated",
  "Sparkling",
  "Spherical",
  "Splashing",
  "Splendid",
  "Spooky",
  "Sprinting",
  "Starlit",
  "Starry",
  "Startling",
  "Successful",
  "Summery",
  "Surprised",
  "Sympathetic",
  "Teasing",
  "Tender",
  "Thoughtful",
  "Thrilling",
  "Tingling",
  "Tinkling",
  "Touching",
  "Tranquil",
  "Treasured",
  "Trembling",
  "Triumphant",
  "Twinkling",
  "Unruly",
  "Urgent",
  "Veiled",
  "Velvety",
  "Victorious",
  "Vigorous",
  "Virile",
  "Walking",
  "Wild",
  "Witty",
  "Wondering",
];

export const animals = [
  "Aardvark",
  "Albatross",
  "Alligator",
  "Alpaca",
  "Ant",
  "Anteater",
  "Antelope",
  "Ape",
  "Armadillo",
  "Donkey",
  "Baboon",
  "Badger",
  "Barracuda",
  "Bat",
  "Bear",
  "Beaver",
  "Bee",
  "Bison",
  "Boar",
  "Buffalo",
  "Butterfly",
  "Camel",
  "Capybara",
  "Caribou",
  "Cassowary",
  "Cat",
  "Caterpillar",
  "Cattle",
  "Chamois",
  "Cheetah",
  "Chicken",
  "Chimpanzee",
  "Chinchilla",
  "Chough",
  "Clam",
  "Cobra",
  "Cockroach",
  "Cod",
  "Cormorant",
  "Coyote",
  "Crab",
  "Crane",
  "Crocodile",
  "Crow",
  "Curlew",
  "Deer",
  "Dinosaur",
  "Dog",
  "Dogfish",
  "Dolphin",
  "Dotterel",
  "Dove",
  "Dragonfly",
  "Duck",
  "Dugong",
  "Dunlin",
  "Eagle",
  "Echidna",
  "Eel",
  "Eland",
  "Elephant",
  "Elk",
  "Emu",
  "Falcon",
  "Ferret",
  "Finch",
  "Fish",
  "Flamingo",
  "Fly",
  "Fox",
  "Frog",
  "Gaur",
  "Gazelle",
  "Gerbil",
  "Giraffe",
  "Gnat",
  "Gnu",
  "Goat",
  "Goldfinch",
  "Goldfish",
  "Goose",
  "Gorilla",
  "Goshawk",
  "Grasshopper",
  "Grouse",
  "Guanaco",
  "Gull",
  "Hamster",
  "Hare",
  "Hawk",
  "Hedgehog",
  "Heron",
  "Herring",
  "Hippopotamus",
  "Hornet",
  "Horse",
  "Human",
  "Hummingbird",
  "Hyena",
  "Ibex",
  "Ibis",
  "Jackal",
  "Jaguar",
  "Jay",
  "Jellyfish",
  "Kangaroo",
  "Kingfisher",
  "Koala",
  "Kookabura",
  "Kouprey",
  "Kudu",
  "Lapwing",
  "Lark",
  "Lemur",
  "Leopard",
  "Lion",
  "Llama",
  "Lobster",
  "Locust",
  "Loris",
  "Louse",
  "Lyrebird",
  "Magpie",
  "Mallard",
  "Manatee",
  "Mandrill",
  "Mantis",
  "Marten",
  "Meerkat",
  "Mink",
  "Mole",
  "Mongoose",
  "Monkey",
  "Moose",
  "Mosquito",
  "Mouse",
  "Mule",
  "Narwhal",
  "Newt",
  "Nightingale",
  "Octopus",
  "Okapi",
  "Opossum",
  "Oryx",
  "Ostrich",
  "Otter",
  "Owl",
  "Oyster",
  "Panther",
  "Parrot",
  "Partridge",
  "Peafowl",
  "Pelican",
  "Penguin",
  "Pheasant",
  "Pig",
  "Pigeon",
  "Pony",
  "Porcupine",
  "Porpoise",
  "Quail",
  "Quelea",
  "Quetzal",
  "Rabbit",
  "Raccoon",
  "Rail",
  "Ram",
  "Rat",
  "Raven",
  "Red deer",
  "Red panda",
  "Reindeer",
  "Rhinoceros",
  "Rook",
  "Salamander",
  "Salmon",
  "Sand Dollar",
  "Sandpiper",
  "Sardine",
  "Scorpion",
  "Seahorse",
  "Seal",
  "Shark",
  "Sheep",
  "Shrew",
  "Skunk",
  "Snail",
  "Snake",
  "Sparrow",
  "Spider",
  "Spoonbill",
  "Squid",
  "Squirrel",
  "Starling",
  "Stingray",
  "Stinkbug",
  "Stork",
  "Swallow",
  "Swan",
  "Tapir",
  "Tarsier",
  "Termite",
  "Tiger",
  "Toad",
  "Trout",
  "Turkey",
  "Turtle",
  "Viper",
  "Vulture",
  "Wallaby",
  "Walrus",
  "Wasp",
  "Weasel",
  "Whale",
  "Wildcat",
  "Wolf",
  "Wolverine",
  "Wombat",
  "Woodcock",
  "Woodpecker",
  "Worm",
  "Wren",
  "Yak",
  "Zebra",
];