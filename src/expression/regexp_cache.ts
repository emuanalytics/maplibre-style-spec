const MAX_CACHED_REGEXPS = 256;
const regExpCache = new Map<string, RegExp>();

/**
 * Returns a compiled `RegExp` for the pattern and flags, reusing a cached one when it exists, so that the `~`
 * operator compiles a pattern once rather than on every evaluation. The cache is cleared when it is full, which
 * bounds it when patterns come from feature data.
 * @private
 */
export function getRegExp(pattern: string, flags: string): RegExp {
    const key = `${flags}/${pattern}`;
    let regExp = regExpCache.get(key);
    if (!regExp) {
        regExp = new RegExp(pattern, flags);
        if (regExpCache.size >= MAX_CACHED_REGEXPS) regExpCache.clear();
        regExpCache.set(key, regExp);
    }
    return regExp;
}

/**
 * Whether `value` matches the regular expression `pattern`, for the `~` operator. Both must be strings or numbers
 * (a number is matched as its text); anything else, such as a missing property, doesn't match.
 * @private
 */
export function regexMatch(value: unknown, pattern: unknown, flags: string = ''): boolean {
    if (typeof value !== 'string' && typeof value !== 'number') return false;
    if (typeof pattern !== 'string' && typeof pattern !== 'number') return false;
    return getRegExp(String(pattern), flags).test(String(value));
}
