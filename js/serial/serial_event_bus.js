(function () {
function createSerialEventBus() {
    const dataSubscribers = new Map();
    const textSubscribers = new Map();
    const byteSubscribers = new Map();
    let exclusiveOwner = null;

    function subscribeData(owner, handler, options = {}) {
        return subscribe(dataSubscribers, owner, handler, options);
    }

    function subscribeText(owner, handler, options = {}) {
        return subscribe(textSubscribers, owner, handler, options);
    }

    function subscribeBytes(owner, handler, options = {}) {
        return subscribe(byteSubscribers, owner, handler, options);
    }

    function subscribe(map, owner, handler, options) {
        if (!owner) {
            throw new Error("serial bus subscriber owner is required");
        }
        if (typeof handler !== "function") {
            throw new TypeError("serial bus subscriber handler must be a function");
        }

        const item = {
            owner,
            handler,
            always: Boolean(options.always),
        };
        map.set(owner, item);

        return () => {
            if (map.get(owner) === item) {
                map.delete(owner);
            }
        };
    }

    function emitData({ text = "", bytes = null } = {}) {
        emit(dataSubscribers, { text, bytes });
        if (bytes) {
            emit(byteSubscribers, bytes);
        }
        if (text) {
            emit(textSubscribers, text);
        }
    }

    function emit(map, payload) {
        for (const item of map.values()) {
            if (!shouldDeliver(item)) {
                continue;
            }
            item.handler(payload);
        }
    }

    function shouldDeliver(item) {
        return !exclusiveOwner || item.always || item.owner === exclusiveOwner;
    }

    function acquireExclusive(owner) {
        if (!owner) {
            throw new Error("serial bus exclusive owner is required");
        }
        if (exclusiveOwner && exclusiveOwner !== owner) {
            throw new Error(`serial bus is already exclusive to ${exclusiveOwner}`);
        }

        exclusiveOwner = owner;
    }

    function releaseExclusive(owner) {
        if (exclusiveOwner === owner) {
            exclusiveOwner = null;
        }
    }

    function getExclusiveOwner() {
        return exclusiveOwner;
    }

    return {
        subscribeData,
        subscribeText,
        subscribeBytes,
        emitData,
        acquireExclusive,
        releaseExclusive,
        getExclusiveOwner,
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createSerialEventBus = createSerialEventBus;
})();
