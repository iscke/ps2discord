'use strict';

// @ts-ignore local file
const Config = require('./config');
const {toID, parseName} = require('./tools');
const websocket = require('websocket');
// todo - what the hell, why am i using this?
const axios = require('axios').default;
const qs = require('querystring');

module.exports = class Showdown {
    /**
    * @param {{name: string, pass: string}} credentials
    * @param {Partial<Pick<Showdown, 'onChat' | 'onError' | 'onPM' | 'onRoom' | 'onRoomDeinit' | 'onRename'>>} handlers
    */
    constructor(credentials, handlers = {}) {
        /** @type {string} ts bug? */
        this.name = '';
        this.userid = '';
        this.credentials = credentials;

        const client = new websocket.client();
        client.on('connect', this.onConnect.bind(this));
        client.on('connectFailed', this.onConnectFailed.bind(this));
        client.connect('ws://sim.smogon.com/showdown/websocket');

        const noop = () => {};
        /** @type {(roomid: string, from: string, message: string) => void} */
        this.onChat = handlers.onChat || noop;
        /** @type {(roomid: string, message: string) => void} */
        this.onError = handlers.onError || noop;
        /** @type {(otherPerson: string, from: string, message: string) => void} */
        this.onPM = handlers.onPM || noop;
        /** @type {(roomid: string, title: string) => void} */
        this.onRoom = handlers.onRoom || noop;
        /** @type {(roomid: string) => void} */
        this.onRoomDeinit = handlers.onRoomDeinit || noop;
        /** @type {(name: string) => void} */
        this.onRename = handlers.onRename || noop;
    }
    /**
     * @param {websocket.connection} connection
     */
    onConnect(connection) {
        this.connection = connection;
        console.log(`connected!`)
        connection.on('message', this.onMessage.bind(this));
        connection.on('error', this.onConnectFailed.bind(this));
        connection.on('close', this.onConnectFailed.bind(this));
        if (Config.autojoins.length) this.connection.send(`|/autojoin ${Config.autojoins.join(',')}`)
    }
    /**
     * @param {websocket.IMessage} message
     */
    onMessage(message) {
        if (message.type !== 'utf8' || !message.utf8Data) return;
        const lines = message.utf8Data.split('\n');
        let roomid = 'lobby';
        if (lines[0].charAt(0) === '>') roomid = lines.shift().slice(1);
        for (const line of lines) {
            if (!line) continue;
            const parts = line.split('|');
            switch (parts[1]) {
            case 'challstr':
                this.challengeKeyID = parts[2];
                this.challstr = parts[3];
                this.tryLogin();
                break;
            case 'pm': 
                const otherPerson = toID(parts[2]) !== this.userid ? parts[2] : parts[3];
                const from = parts[2];
                this.onPM(otherPerson, from, parts.slice(4).join('|'));
                break;
            case 'c:':
                parts.shift();
                // falls through
            case 'c':
                this.onChat(roomid, parts[2], parts.slice(3).join('|'));
                break;
            case 'error':
                this.onError(roomid, `${parts.slice(1)}`);
                break;
            case 'title':
                this.onRoom(roomid, parts[2]);
                return; // stop parsing
            case 'popup':
                this.onChat('global', 'POPUP', parts.slice(1).join('|'));
                break;
            case 'updateuser':
                const name = parseName(parts[2])[1];
                if (this.name !== name) this.onRename(name);
                this.name = name;
                this.userid = toID(name);
                break;
            case 'deinit':
                this.onRoomDeinit(roomid);
                break;
            // don't care
            case 'j': case 'J': case 'join':
            case 'l': case 'L': case 'leave':
            case 'n': case 'N':
            case 'formats':
            case 'updatesearch': case 'updatechallenges':
            case 'init':
            case 'tempnotify': case 'tempnotifyoff':
            case 'uhtml': case 'uhtmlchange':
            case 'html':
            // ???
            case '':
                break;
            default:
                console.log(`unhandled message: ${JSON.stringify(line)}: ${JSON.stringify(message)}`);
            }
        }
    }
    /**
     * @param {string} message
     */
    send(message) {
        if (!this.connection) return false;
        this.connection.send(message);
        return true;
    }
    async tryLogin() {
        if (this.userid === toID(this.credentials.name)) return;
        if (!this.challstr) return;
        // borrowed from pkmn-cc/posho-9000
        const url = `https://play.pokemonshowdown.com/~~showdown/action.php`;
        const data = qs.stringify({
          act: 'login',
          challengekeyid: this.challengeKeyID,
          challenge: this.challstr,
          name: this.credentials.name,
          pass: this.credentials.pass,
        });
        const res = await axios.post(url, data);
        const result = JSON.parse(res.data.slice(1));
        this.send(`|/trn ${this.credentials.name},0,${result.assertion}`);
    }
    /**
     * @param  {...any} args
     */
    onConnectFailed(...args) {
        console.log(`ERROR: ${args}`);
        this.onError('global', `${args}`);
    }
}