'use strict';

Module.register('MMM-NowPlayingOnSpotify', {

  // default values
  defaults: {
    // Module misc
    name: 'MMM-NowPlayingOnSpotify',
    hidden: false,

    // user definable
    updatesEvery: 1,          // How often should the table be updated in s?
    showCoverArt: true       // Do you want the cover art to be displayed?
  },


  start: function () {
    Log.info('Starting module: ' + this.name );

    this.context = {
      paused: true,
      noSong: true,
      imgURL: "",
      songTitle: "",
      artist: "",
      pos: 0,
      posUpdatedAt: Date.now(),
      titleLength: 0,
      subs: [],
      mxmError: "",
      lindex: -1
    };
    this.lyricalWrapper = {};
    this.track = {};

    this.startFetchingLoop();
    Window.npos = this;
  },

  getDom: function () {
    var wpr = document.createElement("div");
    wpr.style = "display: flex; align-items: center; justify-content: center;";
    var wrapper = document.createElement("div");
    this.lyricalWrapper = document.createElement("div");

    if(!this.context.noSong) {
      wrapper.style = "background-color: #222; border-radius: 5px; padding-right: 10px; display: flex; justify-content: flex-start; align-items: center; text-overflow: ellipsis; white-space: nowrap;"
      var art = document.createElement("img");
      art.src = this.context.imgURL;
      art.style = "height: 100px; border-top-left-radius: 5px; border-bottom-left-radius: 5px; margin-right: 10px;";
      var rightSide = document.createElement("div");
      rightSide.style = "display: flex; flex-grow: 1; justify-content: space-between; flex-direction: column; align-items: flex-start; height: 100px;"

      var topData = document.createElement("div");
      topData.style = "display: flex; flex-grow: 1; justify-content: start; flex-direction: column; align-items: flex-start; margin-top: 10px;"

      var title = document.createElement("span");
      title.innerText = this.context.songTitle.split(" -")[0];
      title.className = "bright medium light roboto";
      title.style="text-overflow: ellipsis; white-space: nowrap; overflow: hidden; width: 315px; text-align: left;"
      topData.append(title);

      var source = document.createElement("span");
      source.innerText = this.context.artist;
      source.className = "small light roboto-light";
      topData.append(source);

      rightSide.append(topData);
      let progressBar = document.createElement('progress');
      progressBar.className = 'npos-progress';
      progressBar.value = this.context.pos;
      progressBar.max = this.context.titleLength;
      rightSide.append(progressBar);

      wrapper.appendChild(art);
      wrapper.appendChild(rightSide);
    }

    wpr.appendChild(wrapper);
  
		return wpr;
  },

  serialize: function(obj) {
    var str = [];
    for (var p in obj)
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    return str.join("&");
  },

  getStyles: function () {
    return [
      this.file('css/styles.css'),
      this.file('node_modules/moment-duration-format/lib/moment-duration-format.js'),
      'font-awesome.css'
    ];
  },

  getScripts: function () {
    return [
      'moment.js'
    ];
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "SACTIVITY_TRACK") {
      this.context.noSong = !payload.state.is_playing
      this.context.paused = payload.state.is_paused
      this.context.imgURL = payload.track.album.images[1].url
      this.context.songTitle = payload.track.name
      this.context.artist = this.getArtistName(payload.track.artists)
      this.context.pos = parseInt(payload.state.position_as_of_timestamp)
      this.context.posUpdatedAt = Date.now();
      this.context.titleLength = parseInt(payload.state.duration)
      this.updateDom()
    }

    if (notification === "SERVER_TIMESYNC") {
      let server_ts = payload.timestamp;
      let server_playpos = payload.pos;
      this.context.pos = server_playpos;
      this.context.posUpdatedAt = server_ts;
      console.log('server sync', this.context.pos);

      if(this.context.paused == 0) {
        let lastIndex = this.context.lindex;
        const epoch = this.context.pos;
        const seconds = Math.floor((epoch / 1000));
        const hundredths = Math.floor((epoch - (seconds*1000)) / 10);
        const ts = parseFloat(seconds + "." + hundredths);
        //console.log(ts);
        for(const index in this.context.subs) {
          let sub = this.context.subs[index];
          //console.log(ts, sub.time.total);
          if(ts > sub.time.total) {
            if(this.context.lindex != index) {
              this.context.lindex = index;
            }
          }
        };

        if(this.context.lindex != lastIndex) {
          console.log("update");
          this.sendNotification("MM_UPDATE", {});
        }
      }

      this.updateDom()
    }

    if(notification == "MUSIXMATCH_SUBS") {
      this.context.lindex = 0;
      if(payload.error != undefined) {
        this.context.mxmError = payload.error;
        this.context.subs = [];
      } else {
        this.context.mxmError = ""
        this.context.subs = payload
      }
      this.sendNotification("SUB_UPDATE", this.context.subs);
    }
  },
  
  getArtistName: function (artists) {
    return artists.map((artist) => {
      return artist.name;
    }).join(', ');
  },

  startFetchingLoop() {
    let credentials = {
      cookies: this.config.cookies,
    };

    this.sendSocketNotification('CONNECT_TO_SPOTIFY', credentials);
  }
});
