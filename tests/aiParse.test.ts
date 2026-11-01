// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
    AiParseError,
    extractJson,
    parseChatCard,
    toNutritionInfo,
    toParsedWorkout,
    toPlannedExercises,
    toWaterEstimation,
} from '../lib/aiParse';
import { renderSafeMarkdown } from '../lib/markdown';

describe('extractJson', () => {
    it('parses plain, fenced and prose-wrapped JSON', () => {
        expect(extractJson('{"a":1}')).toEqual({ a: 1 });
        expect(extractJson('```json\n[1,2]\n```')).toEqual([1, 2]);
        expect(extractJson('Here you go: {"a": {"b": 2}} enjoy')).toEqual({ a: { b: 2 } });
    });

    it('throws a user-facing error for garbage', () => {
        expect(() => extractJson('no json here')).toThrow(AiParseError);
        expect(() => extractJson('{broken')).toThrow(AiParseError);
    });
});

describe('toNutritionInfo', () => {
    it('coerces strings/nulls to numbers and drops junk', () => {
        const n = toNutritionInfo({
            mealName: 'Tavuk',
            calories: '450 kcal',
            protein: '31,5',
            carbohydrates: null,
            fat: -4,
            vitaminsAndMinerals: [{ name: 'C', amount: '10', unit: 'mg' }, 'junk', { amount: 3 }],
        });
        expect(n.calories).toBe(450);
        expect(n.protein).toBe(31.5);
        expect(n.carbohydrates).toBe(0);
        expect(n.fat).toBe(0);
        expect(n.fiber).toBe(0);
        expect(n.vitaminsAndMinerals).toEqual([{ name: 'C', amount: 10, unit: 'mg' }]);
    });

    it('rejects non-objects', () => {
        expect(() => toNutritionInfo([1])).toThrow(AiParseError);
    });
});

describe('toPlannedExercises', () => {
    it('accepts an array or {exercises: [...]}', () => {
        const raw = [{ name: 'Squat (Çömelme)', description: 'd', keyPoints: ['a', 2, 'b'], imagePromptEn: 'p' }, { foo: 1 }];
        expect(toPlannedExercises(raw)).toEqual([{ name: 'Squat (Çömelme)', description: 'd', keyPoints: ['a', 'b'], imagePromptEn: 'p' }]);
        expect(toPlannedExercises({ exercises: raw })).toHaveLength(1);
    });

    it('throws when nothing usable is returned', () => {
        expect(() => toPlannedExercises([])).toThrow(AiParseError);
        expect(() => toPlannedExercises({})).toThrow(AiParseError);
    });
});

describe('toParsedWorkout', () => {
    it('normalises sets and returns null when no workout', () => {
        expect(toParsedWorkout(null)).toBeNull();
        expect(toParsedWorkout({ category: 'Göğüs', exercises: [] })).toBeNull();
        expect(
            toParsedWorkout({ category: 'Göğüs', exercises: [{ name: 'Bench', sets: [{ weight: 60, reps: '10' }] }] }),
        ).toEqual({ category: 'Göğüs', exercises: [{ name: 'Bench', sets: [{ weight: '60', reps: '10' }] }] });
    });
});

describe('toWaterEstimation', () => {
    it('clamps volume and defaults confidence', () => {
        expect(toWaterEstimation({ estimatedVolume: 99999, confidence: 'weird', reasoning: 'x' })).toEqual({
            estimatedVolume: 5000,
            confidence: 'medium',
            reasoning: 'x',
        });
    });
});

describe('parseChatCard', () => {
    it('extracts nutrition card and strips the program tag', () => {
        const text = 'Tavuk harika!\n[PROGRAM_KAYDEDILEBILIR]\n:::DATA\n{"type":"nutrition","title":"100g Tavuk","calories":165,"protein":31,"carbs":0,"fat":3.6}\n:::';
        const r = parseChatCard(text);
        expect(r.cleanText).toBe('Tavuk harika!');
        expect(r.cardData).toEqual({ type: 'nutrition', title: '100g Tavuk', calories: 165, protein: 31, carbs: 0, fat: 3.6 });
    });

    it('ignores malformed cards and unknown types', () => {
        expect(parseChatCard(':::DATA {oops ::: hi').cardData).toBeNull();
        expect(parseChatCard(':::DATA {"type":"evil"} :::').cardData).toBeNull();
    });
});

describe('renderSafeMarkdown', () => {
    it('keeps formatting', () => {
        const html = renderSafeMarkdown('**Kalın** ve\n- madde');
        expect(html).toContain('<strong>Kalın</strong>');
        expect(html).toContain('<li>madde</li>');
    });

    it('removes scripts, event handlers, links and images', () => {
        const html = renderSafeMarkdown('<img src=x onerror="alert(1)"><script>alert(2)</script>[tıkla](javascript:alert(3)) <a href="https://evil">x</a>');
        expect(html).not.toMatch(/<script|onerror|<img|javascript:|href=/i);
    });
});
