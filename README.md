# jitsi-vue-experiment

## How to run code locally
```
# step 1/3: copy app files into your laptop
git clone https://github.com/eltonlin1998/jitsi-vue-experiment

# step 2/3: download the code libraries that this app relies on
npm install 

# step 3/3: start the app on localhost:8080
npm run serve
```

## How to understand the code
`public/index.html` calls `main.js`, which calls `<App/>`, which calls `<router-view/>`, which calls `<VideoConferenceRoom/>`. 
Therefore `src/components/VideoConferencingRoom.vue` is the essence of the codebase.

I recorded some blackboard videos to explain the code and the bug: 
  - [Correctness argument (1/2)](https://explain-latest.firebaseapp.com/explanation/SylZBcwi4b868H1q8eGJ/class/mDbUrvjy4pe8Q5s5wyoD)
  - [Correctness argument (2/2)](https://explain-latest.firebaseapp.com/explanation/qBeQGho7HDSJ1brHMKdU/class/mDbUrvjy4pe8Q5s5wyoD)
  - [Rubber-duck explanation of camera bug](https://explain-latest.firebaseapp.com/explanation/W4tWFf6BBpLOFaLnL0mm/class/mDbUrvjy4pe8Q5s5wyoD)
