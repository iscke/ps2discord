'use strict';

const Discord = require('discord.js');
const PS = require('./showdown');
const {toID, toRoomID, html2text} = require('./tools');
// @ts-ignore local file
const Config = require('./config');
const ROOMS = 'ps-rooms';
const PMS = 'ps-pms';
const META = 'ps-meta';

class PS2Discord {
    /**
     * @param {string} token 
     */
    constructor(token) {
        this.token = token;
        this.discordClient = new Discord.Client();

        this.discordClient.on('message', this.onDiscordMessage.bind(this));

        /** @type {Discord.Guild} */
        this.guild = null;
        /** @type {Discord.CategoryChannel} */
        this.roomsCat = null;
        /** @type {Discord.CategoryChannel} */
        this.pmsCat = null;
        /** @type {Discord.TextChannel} */
        this.metaChannel = null;

        /** @type {RegExp | null} */
        this.nameRegex = null;
        this.ownerTag = '';

        // if we send a PM that gets an instant response, sometimes PS will reply before discord makes the channel
        // this lets us wait for channel modifications to complete before doing any more, so we don't get dupes
        /** @type {Promise<any>} */
        this.modifyingChannels = Promise.resolve();

        this.discordClient.login(this.token);
    }

    /**
     * @param {string} from
     * @param {string} message
     */
    processChat(from, message) {
        if (message.charAt(0) !== '/' || message.charAt(1) === '/') return `${from}: ${message}`;

        const spaceIndex = message.indexOf(' ');
        const command = message.slice(1, spaceIndex);
        message = message.slice(spaceIndex + 1);

        console.log(`[${command}]`);
        switch (command) {
        case 'me':
        case 'mee':
            return `•${from} _${message}_`;
        case 'invite':
            return `${from} invites you to join "${message}"`;
        case 'announce':
            return `${from} announces: **${message}**`;
        case 'log':
            return `[${from}] log: ${message}`;
        case 'text':
            return `[${from}] text: ${message.slice()}`
        case 'error':
            return `[${from}] ERROR: ${message}`;
        case 'uhtml': case 'uhtmlchange':
            message = message.split(',').slice(2).join(',');
            // falls through
        case 'html':
        case 'raw':
        case 'nonotify':
            return `[${from}] ${html2text(message)}`;
        }
    }

    /**
     * @param {Discord.Guild} guild
     * @param {Discord.User} owner
     */
    async setup(guild, owner) {
        this.guild = guild;
        this.ownerTag = `<@${owner.id}>`;
        [this.roomsCat, this.pmsCat, this.metaChannel] = (await Promise.all([
            this.getCategory(ROOMS),
            this.getCategory(PMS),
            (async () => {
                return /** @type {Discord.TextChannel} */ (this.guild.channels.find(channel => channel.type === 'text' && channel.name === META) 
                    || this.guild.createChannel(META, {type: 'text'}))
            })(),
        ]));

        // setup ps
        this.showdownClient = new PS(Config.showdownCredentials, {
            onRoom: async (roomid) => {
                // create a room without doing anything
                (await this.getRoomChannel(roomid)).send(`Joined.`);
            },
            onChat: async (roomid, from, message) => {
                if (this.nameRegex) message = message.replace(this.nameRegex, this.ownerTag);
                if (Config.highlightRegex) message = message.replace(Config.highlightRegex, this.ownerTag);
                (await this.getRoomChannel(roomid)).send(this.processChat(from, message));
            },
            onHTML: async (roomid, message) => {
                (await this.getRoomChannel(roomid)).send(`[HTML] ${html2text(message)}`);
            },
            onError: async (roomid, error) => {
                (await this.getRoomChannel(roomid)).send(`ERROR: ${error}`);
            },
            onPM: async (otherPerson, from, message) => {
                (await this.getPmChannel(otherPerson)).send(this.processChat(from, message));
            },
            onRename: async (name) => {
                if (Config.highlightName) this.nameRegex = new RegExp(String.raw`\b${name.replace(/[^a-zA-Z0-9 ]/g, '')}\b`, 'ig');
                this.metaChannel.send(`Renamed to: ${name}`);
            },
            onRoomDeinit: async (roomid) => {
                (await this.getRoomChannel(roomid)).send(`Room closed.`);
            },
        });
    }
    /**
     * @param {Discord.Message} message
     */
    async onDiscordMessage(message) {
        if (message.author.bot) return;
        const content = message.content;
        if (message.channel.type !== 'text') return;
        message.delete();
        const channel = /** @type {Discord.TextChannel} */ (message.channel);
        if (content === 's') return this.setup(message.guild, message.author);
        if (!this.guild) return message.reply(`not setup, use 's'`);

        if (channel.parent) {
            if (channel.parent.name === ROOMS) {
                return this.sendShowdownRoom(channel.name, content);
            } else if (channel.parent.name === PMS) {
                return this.sendShowdownPM(channel.name, content);
            }
        } 
        return this.sendShowdownRoom('', content);
    }
    /**
     * @param {string} to
     * @param {string} message
     */
    sendShowdownPM(to, message) {
        this.showdownClient.send(`|/pm ${to}, ${message}`);
    }
    /**
     * @param {string} to
     * @param {string} message
     */
    sendShowdownRoom(to, message) {
        this.showdownClient.send(`${to}|${message}`);
    }
    /**
     * @param {string} name
     * @returns {Promise<Discord.TextChannel>}
     */
    async getPmChannel(name) {
        await this.modifyingChannels;
        name = toID(name);
        const channel = this.pmsCat.children.find(channel => toID(channel.name) === name);
        if (channel) return Promise.resolve(/** @type {Discord.TextChannel} */(channel));
        this.modifyingChannels = this.guild.createChannel(name, {type: 'text', parent: this.pmsCat});
        return this.modifyingChannels;
    }
    /**
     * @param {string} name
     * @returns {Promise<Discord.TextChannel>}
     */
    async getRoomChannel(name) {
        await this.modifyingChannels;
        name = toRoomID(name);
        const channel = this.roomsCat.children.find(channel => toRoomID(channel.name) === name);
        if (channel) return Promise.resolve(/** @type {Discord.TextChannel} */(channel));
        this.modifyingChannels = this.guild.createChannel(name, {type: 'text', parent: this.roomsCat});
        return this.modifyingChannels;
    }
    /**
     * @param {string} name
     * @returns {Promise<Discord.CategoryChannel>}
     */
    async getCategory(name) {
        await this.modifyingChannels;
        const channel = this.guild.channels.find(channel => channel.type === 'category' && channel.name === name);
        if (channel) return Promise.resolve(/** @type {Discord.CategoryChannel} */(channel));
        this.modifyingChannels = this.guild.createChannel(name, {type: 'category'});
        return this.modifyingChannels;
    }
}

const client = new PS2Discord(Config.discordToken);
