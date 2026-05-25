(function () {
const SESSION_OWNER_LABELS = {
    "terminal": "Terminal",
    "quick-send": "Quick Send",
    "netview": "NetView",
    "config": "Configuration",
    "firmware": "Firmware Update",
};

function createSerialSession({
    serialManager,
    serialBus,
    onStatusChange = () => {},
} = {}) {
    if (!serialManager) {
        throw new Error("createSerialSession requires serialManager");
    }
    if (!serialBus) {
        throw new Error("createSerialSession requires serialBus");
    }

    let activeOwner = null;
    let activeLabel = "";
    let hardExclusive = false;
    let refCount = 0;

    function acquire(owner, label = ownerLabel(owner), options = {}) {
        validateOwner(owner);

        if (activeOwner && activeOwner !== owner) {
            throw new Error(`Serial is busy: ${activeLabel || ownerLabel(activeOwner)}`);
        }

        const requestedHard = Boolean(options.hard);
        if (!activeOwner) {
            if (requestedHard) {
                serialBus.acquireExclusive(owner);
            }
            activeOwner = owner;
            activeLabel = label || ownerLabel(owner);
            hardExclusive = requestedHard;
            refCount = 1;
            notify();
        } else {
            if (requestedHard && !hardExclusive) {
                serialBus.acquireExclusive(owner);
                hardExclusive = true;
                notify();
            }
            refCount++;
        }

        let released = false;
        return {
            owner,
            release() {
                if (released) return;
                released = true;
                release(owner);
            },
        };
    }

    function release(owner) {
        if (activeOwner !== owner) {
            return;
        }

        refCount = Math.max(0, refCount - 1);
        if (refCount > 0) {
            return;
        }

        if (hardExclusive) {
            serialBus.releaseExclusive(owner);
        }
        activeOwner = null;
        activeLabel = "";
        hardExclusive = false;
        refCount = 0;
        notify();
    }

    async function runExclusive(owner, label, fn, options = {}) {
        const token = acquire(owner, label, options);
        try {
            return await fn();
        } finally {
            token.release();
        }
    }

    async function writeText(owner, text, options = {}) {
        assertCanWrite(owner);
        if (options.echo) {
            options.echo();
        }
        await serialManager.writeText(text);
    }

    async function writeBytes(owner, bytes, options = {}) {
        assertCanWrite(owner);
        if (options.echo) {
            options.echo();
        }
        await serialManager.writeBytes(bytes);
    }

    async function writeATCommand(owner, cmd, options = {}) {
        assertCanWrite(owner);
        if (options.echo) {
            options.echo();
        }
        await serialManager.writeATCommand(cmd);
    }

    function assertCanWrite(owner) {
        validateOwner(owner);
        if (!serialManager.isConnected()) {
            throw new Error("serial is not connected");
        }
        if (activeOwner && activeOwner !== owner) {
            throw new Error(`Serial is busy: ${activeLabel || ownerLabel(activeOwner)}`);
        }
    }

    function canWrite(owner) {
        return serialManager.isConnected() &&
               (!activeOwner || activeOwner === owner);
    }

    function isBusy() {
        return Boolean(activeOwner);
    }

    function getActiveOwner() {
        return activeOwner;
    }

    function getStatusText() {
        if (!activeOwner) {
            return "";
        }
        return `Busy: ${activeLabel || ownerLabel(activeOwner)}`;
    }

    function reset() {
        if (activeOwner && hardExclusive) {
            serialBus.releaseExclusive(activeOwner);
        }
        activeOwner = null;
        activeLabel = "";
        hardExclusive = false;
        refCount = 0;
        notify();
    }

    function notify() {
        onStatusChange({
            activeOwner,
            activeLabel,
            hardExclusive,
            statusText: getStatusText(),
        });
    }

    return {
        acquire,
        release,
        runExclusive,
        writeText,
        writeBytes,
        writeATCommand,
        canWrite,
        isBusy,
        getActiveOwner,
        getStatusText,
        reset,
    };
}

function validateOwner(owner) {
    if (!owner) {
        throw new Error("serial session owner is required");
    }
}

function ownerLabel(owner) {
    return SESSION_OWNER_LABELS[owner] || owner;
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createSerialSession = createSerialSession;
})();
