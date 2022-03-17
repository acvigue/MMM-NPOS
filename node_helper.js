'use strict';

const NodeHelper = require('node_helper');
const sactivity = require('sactivity');
const axios = require("axios");
const c = require("crypto")
var NanoTimer = require('nanotimer');
const { fstat, writeFile, writeFileSync, existsSync, readFileSync } = require('fs');

module.exports = NodeHelper.create({

  start: function () {
    this.cookies = undefined;
    this.accessToken = undefined;

    this.serverPos = undefined;
    this.serverTs = undefined;
    this.is_paused = false;
    this.lastSyncTime = Date.now();

    var timer1 = new NanoTimer();
    var timer2 = new NanoTimer();
    timer1.setInterval(this.syncTime.bind(this), '', '0.5s');
    timer2.setInterval(this.syncServerTime.bind(this), '', '10s');

    this.trackData = undefined;
  },

  getMusixMatch: async function() {

    let queryParams = {
      format: "json",
      f_subtitle_length: Math.floor(this.trackData.track.duration_ms / 1000),
      namespace: "lyrics_synched",
      part: "lyrics_crowd,user,lyrics_verified_by",
      q_album: encodeURIComponent(this.trackData.track.album.name),
      q_artist: encodeURIComponent(this.trackData.track.artists[0].name),
      q_artists: encodeURIComponent(this.trackData.track.artists.map((artist) => {
        return artist.name;
      }).join(",")),
      q_duration: this.trackData.track.duration_ms / 1000,
      q_track: encodeURIComponent(this.trackData.track.name),
      tags: "nowplaying",
      userblob_id: Buffer.from((this.trackData.track.name.toLowerCase() + "_" + this.trackData.track.artists[0].name.toLowerCase() + "_" + Math.floor(this.trackData.track.duration_ms/1000)).toLowerCase()).toString('base64').replace("=", ""),
      user_language: "en",
      track_spotify_id:  encodeURIComponent(this.trackData.track.uri),
      f_subtitle_length_max_deviation: 1,
      subtitle_format: "mxm",
      app_id: "web-desktop-app-v1.0",
      usertoken: "2011096d54c58cadebf53f23d750ec5391eefcbc87787903ae6f76",
      guid: "aed5aa85-c6fc-4a50-a3cd-ab2aad64eed4"
    }

    if(existsSync(`/opt/magic_mirror/cache-mxm/${this.trackData.track.uri}.json`)) {
      let fdata = readFileSync(`/opt/magic_mirror/cache-mxm/${this.trackData.track.uri}.json`, 'utf8')
      let x = JSON.parse(fdata)
      this.sendSocketNotification("MUSIXMATCH_SUBS", x)
      return;
    }

    var queryString = Object.keys(queryParams).map(key => key + '=' + queryParams[key]).join('&');
    let url = "https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?" + queryString;
    var s;
    try {
      let x = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15",
          "Cookie": "AWSELBCORS=55578B011601B1EF8BC274C33F9043CA947F99DCFF6AB1B746DBF1E96A6F2B997493EE03F2147917E39D2A652D936EC596A3D913E4008D1C57FBF597F49A29279FAB8E1E61; AWSELB=55578B011601B1EF8BC274C33F9043CA947F99DCFF6AB1B746DBF1E96A6F2B997493EE03F2147917E39D2A652D936EC596A3D913E4008D1C57FBF597F49A29279FAB8E1E61; x-mxm-user-id=g2%3A114433868720674838117; x-mxm-token-guid=aed5aa85-c6fc-4a50-a3cd-ab2aad64eed4; mxm-encrypted-token="
        },
        withCredentials: true
      })
      s = x.data;
      if(x.data.message.header.status_code != 401) {
        let subs = x.data.message.body.macro_calls["track.subtitles.get"].message.body.subtitle_list[0].subtitle;
        let z = subs.subtitle_body;
        if(z == "") {
          if(subs.restricted == 1) {
            this.sendSocketNotification("MUSIXMATCH_SUBS", {error: "Unfortunately, we're not authorized to show these lyrics."});
          } else {
            this.sendSocketNotification("MUSIXMATCH_SUBS", {error: "Couldn't get lyrics."});
          }
        }
        writeFileSync(`/opt/magic_mirror/cache-mxm/${this.trackData.track.uri}.json`, JSON.stringify(JSON.parse(z)));
        this.sendSocketNotification("MUSIXMATCH_SUBS", JSON.parse(z));
      } else {
        this.sendSocketNotification("MUSIXMATCH_SUBS", {error: "RATE_LIMIT"});
      }
      
    } catch(e) {
      
    }
  },

  trackResolverCallback: function(data) {
    let trackData = data[0];
    if(trackData != undefined) {
      if(this.trackData == undefined || trackData.track.uri != this.trackData.track.uri) {
        this.trackData = trackData
        this.getMusixMatch()
      }
      this.trackData = trackData

      this.sendSocketNotification('SACTIVITY_TRACK', Object.assign(trackData, {
        sent_at_ts: Date.now()
      }));

      this.is_paused = trackData.state.is_paused;
      this.serverTs = trackData.state.timestamp;
      this.serverPos = parseInt(trackData.state.position_as_of_timestamp);
    }
  },

  stateObserverCallback: function(data) {
    let dto = data[0][1];
    this.is_paused = dto.is_paused;
    this.serverTs = dto.timestamp;
    this.serverPos = parseInt(dto.position_as_of_timestamp);
  },

  syncTime: async function() {
    let delta = Date.now() - this.serverTs;
    if(this.serverPos != undefined && !this.is_paused) {
      let ts = this.serverPos + delta;
      console.log(ts);
      this.sendSocketNotification('SERVER_TIMESYNC', {
        timestamp: Date.now(),
        pos: ts
      });
    }
  },

  syncServerTime: async function() {
    if(this.serverPos != undefined) {
      let clientStartTime = Date.now();
      let x = await axios.get("https://api.spotify.com/v1/me/player", {
        headers: {
          "Authorization": `Bearer ${this.accessToken}`
        }
      })
      let clientEndTime = Date.now();
      let delay = Math.floor((clientEndTime - clientStartTime) / 2);
      this.serverTs = Date.now() - delay;
      this.serverPos = parseInt(x.data.progress_ms)
      console.log(this.serverPos)
    }
  },

  socketNotificationReceived: function(notification, payload) {
    switch (notification) {
      case 'CONNECT_TO_SPOTIFY':
        
        this.cookies = payload.cookies;
        sactivity.CoordinatedSpotifySocket.create(this.cookies).then(({socket, accessToken}) => {
          this.accessToken = accessToken

          const playerTrackResolver = new sactivity.PlayerTrackResolver(this.trackResolverCallback.bind(this), {
            cookies: this.cookies,
            accessToken: this.accessToken
          });

          const playerStateObserver = new sactivity.PlayerStateObserver(this.stateObserverCallback.bind(this), {
            cookies: this.cookies,
            accessToken: this.accessToken
          })

          playerTrackResolver.observe(socket)
          playerStateObserver.observe(socket)
        });

        if(this.trackData != undefined) {
          this.getMusixMatch()
          this.sendSocketNotification('SACTIVITY_TRACK', Object.assign(this.trackData, {
            sent_at_ts: Date.now()
          }));
        }

        break;
    }
  }
});
