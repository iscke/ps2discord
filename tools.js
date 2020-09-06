'use strict';

module.exports = class Tools {
    /** @param {any} input */
    static toID(input) {
        return ('' + input).toLowerCase().replace(/[^a-z0-9]+/g, '');
    }
    /** @param {any} input */
    static toRoomID(input) {
        return ('' + input).toLowerCase().replace(/[^a-z0-9\-]+/g, '');
    }
    /**
     * @param {string} name
     */
    static parseName(name) {
        let statusIndex = name.indexOf('@', 1);
        if (statusIndex < 0) statusIndex = name.length;
        const rank = name.charAt(0);
        const username = name.slice(1, statusIndex);
        return [rank, username];
    }
    /**
     * "close enough" function to pull the text out of a html message
     * @param {string} text 
     */
    static html2text(text) {
        return Tools.unescapeHTML(text.replace(/<[^>]*>/g, match => match.includes('/') ? '\n' : '')).replace(/(?:\n\s*\n)+/g, '\n');
    }
    /**
    * Adapted from pokemon-showdown
    * @param {string} str
    */
    static unescapeHTML(str) {
        if (!str) return '';
        return ('' + str)
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#x2f;/g, '/');
    }
}