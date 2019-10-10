'use strict';

const {toID, parseName} = require('./tools');
const websocket = require('websocket');
// todo - what the hell, why am i using this?
const axios = require('axios').default;
const qs = require('querystring');
const {EventEmitter} = require('events');

module.exports = class extends EventEmitter {
    /**
    * @param {{name: string, pass: string}} credentials
    */
    constructor(credentials) {
        super();
        /** @type {string} ts bug? */
        this.name = '';
        this.userid = '';
        this.credentials = credentials;

        const client = new websocket.client();
        client.on('connect', this.onConnect.bind(this));
        client.on('connectFailed', this.onConnectFailed.bind(this));
        client.connect('ws://sim.smogon.com/showdown/websocket');
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
            const parts = line.split('|');
            switch (parts[1]) {
            case 'challstr':
                this.challengeKeyID = parts[2];
                this.challstr = parts[3];
                this.tryLogin();
                break;
            case 'pm': 
                this.emit('pm', parts[2], parts.slice(4).join('|'));
                break;
            case 'c:':
                parts.shift();
                // falls through
            case 'c': 
                this.emit('chat', roomid, parts[2], parts.slice(3).join('|'));
                break;
            case 'error':
                this.emit('chat', roomid, `ERROR: ${parts.slice(1)}`);
                break;
            case 'title':
                this.emit('room', roomid, parts[2]);
                return; // stop parsing
            case 'popup':
                this.emit('chat', 'global', parts.slice(1).join('|'));
                break;
            case 'updateuser':
                const name = parseName(parts[2])[1];
                if (this.name !== name) this.emit('global', `Renamed to ${name}`);
                this.name = name;
                break;
            default:
                console.log(`unhandled message: ${JSON.stringify(parts)}`);
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
        this.emit('global', `ERROR: ${args}`);
    }

}