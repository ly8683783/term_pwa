(function () {
const appModules = window.TermPWA || {};

const TERMINAL_THEME_KEY = "lr71TerminalTheme";
const TERMINAL_DEFAULT_THEME = "bright-dark";
const TERMINAL_THEME_CHANGE_EVENT = "terminal-theme-change";

function getThemeSelect() {
    return document.getElementById("terminalThemeSelect");
}

function getThemeValues() {
    const select = getThemeSelect();
    if (!select) {
        return [TERMINAL_DEFAULT_THEME];
    }

    const values = Array.from(select.options)
        .map(option => option.value)
        .filter(Boolean);
    return values.length ? values : [TERMINAL_DEFAULT_THEME];
}

function isValid(theme) {
    return Boolean(theme && getThemeValues().includes(theme));
}

function normalize(theme) {
    return isValid(theme) ? theme : TERMINAL_DEFAULT_THEME;
}

function load() {
    return normalize(localStorage.getItem(TERMINAL_THEME_KEY));
}

function save(theme) {
    const nextTheme = normalize(theme);
    localStorage.setItem(TERMINAL_THEME_KEY, nextTheme);
    window.dispatchEvent(new CustomEvent(TERMINAL_THEME_CHANGE_EVENT, {
        detail: { theme: nextTheme },
    }));
    return nextTheme;
}

function apply(element, theme = load()) {
    const nextTheme = normalize(theme);
    if (element) {
        element.dataset.theme = nextTheme;
    }
    return nextTheme;
}

function syncSelect(select = getThemeSelect(), theme = load()) {
    const nextTheme = normalize(theme);
    if (select) {
        select.value = nextTheme;
    }
    return nextTheme;
}

window.TermPWA = {
    ...appModules,
    terminalTheme: {
        key: TERMINAL_THEME_KEY,
        defaultTheme: TERMINAL_DEFAULT_THEME,
        changeEvent: TERMINAL_THEME_CHANGE_EVENT,
        isValid,
        load,
        save,
        apply,
        syncSelect,
    },
};
})();
