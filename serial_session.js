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

    let activeSession = null;

    function acquire(owner, label = ownerLabel(owner), options = {}) {
        validateOwner(owner);

        if (activeSession && activeSession.owner !== owner) {
            throw new Error(`Serial is busy: ${activeSession.label || ownerLabel(activeSession.owner)}`);
        }

        const requestedHard = Boolean(options.hard);
        if (!activeSession) {
            if (requestedHard) {
                serialBus.acquireExclusive(owner);
            }
            activeSession = {
                owner,
                label: label || ownerLabel(owner),
                hardExclusive: requestedHard,
                refCount: 1,
            };
            notify();
        } else {
            if (requestedHard && !activeSession.hardExclusive) {
                serialBus.acquireExclusive(owner);
                activeSession.hardExclusive = true;
                notify();
            }
            activeSession.refCount++;
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
        if (!activeSession || activeSession.owner !== owner) {
            return;
        }

        activeSession.refCount = Math.max(0, activeSession.refCount - 1);
        if (activeSession.refCount > 0) {
            return;
        }

        if (activeSession.hardExclusive) {
            serialBus.releaseExclusive(owner);
        }
        activeSession = null;
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
        if (activeSession && activeSession.owner !== owner) {
            throw new Error(`Serial is busy: ${activeSession.label || ownerLabel(activeSession.owner)}`);
        }
    }

    function canWrite(owner) {
        return serialManager.isConnected() &&
               (!activeSession || activeSession.owner === owner);
    }

    function isBusy() {
        return Boolean(activeSession);
    }

    function getActiveOwner() {
        return activeSession ? activeSession.owner : null;
    }

    function getStatusText() {
        if (!activeSession) {
            return "";
        }
        return `Busy: ${activeSession.label || ownerLabel(activeSession.owner)}`;
    }

    function reset() {
        if (activeSession && activeSession.hardExclusive) {
            serialBus.releaseExclusive(activeSession.owner);
        }
        activeSession = null;
        notify();
    }

    function notify() {
        onStatusChange({
            activeOwner: activeSession ? activeSession.owner : null,
            activeLabel: activeSession ? activeSession.label : "",
            hardExclusive: Boolean(activeSession && activeSession.hardExclusive),
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
