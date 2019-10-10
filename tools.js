'use strict';

module.exports = class {
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
        let statusIndex = name.indexOf('@');
        if (statusIndex < 0) statusIndex = name.length;
        const rank = name.charAt(0);
        const username = name.slice(1, statusIndex);
        return [rank, username];
    }
}