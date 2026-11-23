// Tests for the `~` regular expression operator, an Emu Analytics addition to the style spec.
import {describe, test, expect} from 'vitest';
import {createExpression} from '.';
import {featureFilter, isExpressionFilter} from '../feature_filter';
import {convertFilter} from '../feature_filter/convert';
import {validateStyleMin} from '../validate_style.min';
import {getRegExp} from './regexp_cache';
import type {Feature} from '.';
import type {FilterSpecification} from '../types.g';

function matches(filter: unknown, properties: Record<string, unknown>, id?: unknown): boolean {
    const f = featureFilter(filter as FilterSpecification, 'layers[0].filter').filter;
    return f({zoom: 0}, {properties, id} as any as Feature);
}

function parseErrors(expression: unknown): string[] {
    const result = createExpression(expression, 'rk', null);
    return result.result === 'error' ? result.value.map((e) => e.message) : [];
}

function validateFilter(filter: unknown) {
    return validateStyleMin({
        version: 8,
        sources: {s: {type: 'geojson', data: {type: 'FeatureCollection', features: []}}},
        layers: [{id: 'l', type: 'fill', source: 's', filter}]
    } as any);
}

describe('~ expression', () => {
    test('matches without a collator, case-sensitively', () => {
        const filter = ['~', ['get', 'name'], '^Lon'];
        expect(matches(filter, {name: 'London'})).toBe(true);
        expect(matches(filter, {name: 'london'})).toBe(false);
        expect(matches(filter, {name: 'Paris'})).toBe(false);
    });

    test('ignores case with a case-insensitive collator', () => {
        const filter = ['~', ['get', 'name'], '^lon', ['collator', {'case-sensitive': false}]];
        expect(matches(filter, {name: 'London'})).toBe(true);
        expect(matches(filter, {name: 'LONDON'})).toBe(true);
        expect(matches(filter, {name: 'Paris'})).toBe(false);
    });

    test('respects case with a case-sensitive collator', () => {
        const filter = ['~', ['get', 'name'], '^Lon', ['collator', {'case-sensitive': true}]];
        expect(matches(filter, {name: 'London'})).toBe(true);
        expect(matches(filter, {name: 'london'})).toBe(false);
    });

    test('takes the pattern from feature data', () => {
        const filter = ['~', ['string', ['get', 'x']], ['string', ['get', 'y']]];
        expect(matches(filter, {x: 'same', y: '^sa'})).toBe(true);
        expect(matches(filter, {x: 'same', y: 'Same'})).toBe(false);
    });

    test('matches numbers as their text', () => {
        expect(matches(['~', ['get', 'code'], '^12'], {code: 123})).toBe(true);
        expect(matches(['~', ['get', 'code'], 23], {code: 123})).toBe(true);
        expect(matches(['~', ['get', 'code'], '^23'], {code: 123})).toBe(false);
    });

    test("doesn't match a missing or non-string value", () => {
        const filter = ['~', ['get', 'name'], '^nu'];
        expect(matches(filter, {})).toBe(false);
        expect(matches(filter, {name: null})).toBe(false);
        expect(matches(['~', ['get', 'flag'], 'true'], {flag: true})).toBe(false);
    });

    test('accepts string, number and value inputs at parse time', () => {
        expect(parseErrors(['~', 'abc', '^a'])).toEqual([]);
        expect(parseErrors(['~', 123, '^1'])).toEqual([]);
        expect(parseErrors(['~', 'abc', 12])).toEqual([]);
        expect(parseErrors(['~', ['get', 'name'], '^a'])).toEqual([]);
    });

    test('rejects other input types at parse time', () => {
        expect(parseErrors(['~', true, '^t'])).toEqual([
            '"~" comparisons are not supported for type \'boolean\'.'
        ]);
        expect(parseErrors(['~', 'abc', ['literal', ['a']]])).toEqual([
            '"~" comparisons are not supported for type \'array<string, 1>\'.'
        ]);
        expect(parseErrors(['~', ['to-color', 'red'], 'r'])).toHaveLength(1);
    });
});

describe('~ legacy filter', () => {
    test('is classified as a legacy filter', () => {
        expect(isExpressionFilter(['~', 'name', '^Lon'])).toBe(false);
        expect(isExpressionFilter(['~', ['get', 'name'], '^Lon'])).toBe(true);
    });

    test('matches a property', () => {
        const filter = ['~', 'name', '^Lon'];
        expect(matches(filter, {name: 'London'})).toBe(true);
        expect(matches(filter, {name: 'london'})).toBe(false);
        expect(matches(filter, {name: 'Paris'})).toBe(false);
        expect(matches(filter, {})).toBe(false);
        expect(matches(['~', 'code', 12], {code: 123})).toBe(true);
    });

    test('matches the feature id', () => {
        expect(matches(['~', '$id', '^ab'], {}, 'abc')).toBe(true);
        expect(matches(['~', '$id', '^ab'], {}, 'xyz')).toBe(false);
    });

    test('converts to an equivalent expression', () => {
        const converted = convertFilter(['~', 'name', '^Lon'] as FilterSpecification);
        expect(isExpressionFilter(converted)).toBe(true);
        expect(matches(converted, {name: 'London'})).toBe(true);
        expect(matches(converted, {name: 'Paris'})).toBe(false);
        expect(matches(converted, {})).toBe(false);
    });

    test('validates', () => {
        expect(validateFilter(['~', 'name', '^Lon'])).toEqual([]);
        expect(validateFilter(['~', 'code', 12])).toEqual([]);
        expect(validateFilter(['any', ['~', 'name', '^Lon'], ['==', 'name', 'Paris']])).toEqual([]);
    });

    test('rejects $type and the wrong number of arguments', () => {
        expect(validateFilter(['~', '$type', 'Point']).map((e) => e.message)).toEqual([
            'layers[0].filter: "$type" cannot be use with operator "~"'
        ]);
        // Not three elements, so it's read as an expression, as with the other comparison operators.
        expect(validateFilter(['~', 'name']).map((e) => e.message)).toEqual([
            'layers[0].filter: Expected two or three arguments.'
        ]);
    });
});

describe('~ expression validation', () => {
    test('validates with and without a collator', () => {
        expect(validateFilter(['~', ['get', 'name'], '^Lon'])).toEqual([]);
        expect(
            validateFilter(['~', ['get', 'name'], '^lon', ['collator', {'case-sensitive': false}]])
        ).toEqual([]);
    });
});

describe('~ compiled patterns', () => {
    test('reuses the compiled RegExp for a pattern and flags', () => {
        expect(getRegExp('^cached', '')).toBe(getRegExp('^cached', ''));
        expect(getRegExp('^cached', 'i')).toBe(getRegExp('^cached', 'i'));
        expect(getRegExp('^cached', 'i')).not.toBe(getRegExp('^cached', ''));
    });

    test('compiles a literal pattern once across evaluations', () => {
        const filter = ['~', ['get', 'name'], '^compiled-once'];
        matches(filter, {name: 'compiled-once-1'});
        const compiled = getRegExp('^compiled-once', '');
        matches(filter, {name: 'compiled-once-2'});
        expect(getRegExp('^compiled-once', '')).toBe(compiled);
    });
});
