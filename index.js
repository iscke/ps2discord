'use strict';

const Discord = require('discord.js');
const PS = require('./showdown');
const {toID, toRoomID} = require('./tools');
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

        this.discordClient.login(this.token);
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

                (await this.getRoomChannel(roomid)).send(`${from}: ${message}`);
            },
            onError: async (roomid, error) => {
                (await this.getRoomChannel(roomid)).send(`ERROR: ${error}`);
            },
            onPM: async (otherPerson, from, message) => {
                (await this.getPmChannel(otherPerson)).send(`${from}: ${message}`);
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
        name = toID(name);
        // @ts-ignore
        return this.pmsCat.children.find(channel => toID(channel.name) === name)
            || await this.guild.createChannel(name, {type: 'text', parent: this.pmsCat});
    }
    /**
     * @param {string} name
     * @returns {Promise<Discord.TextChannel>}
     */
    async getRoomChannel(name) {
        name = toRoomID(name);
        // @ts-ignore
        return this.roomsCat.children.find(channel => toRoomID(channel.name) === name)
            || await this.guild.createChannel(name, {type: 'text', parent: this.roomsCat});
    }
    /**
     * @param {string} name
     * @returns {Promise<Discord.CategoryChannel>}
     */
    async getCategory(name) {
        // @ts-ignore
        return this.guild.channels.find(channel => channel.type === 'category' && channel.name === name)
            || await this.guild.createChannel(name, {type: 'category'});
    }
}

const client = new PS2Discord(Config.discordToken);
