import { describe, expect, it } from 'vitest';
import {
    bodyFatCategory,
    calculateCalories,
    macroSplit,
    mifflinStJeorBmr,
    navyBodyFatPercent,
    ValidationError,
} from '../lib/fitness';

describe('Mifflin-St Jeor BMR', () => {
    it('matches reference values', () => {
        // 10*80 + 6.25*180 - 5*30 + 5 = 1780
        expect(mifflinStJeorBmr('male', 80, 180, 30)).toBe(1780);
        // 10*60 + 6.25*165 - 5*25 - 161 = 1345.25
        expect(mifflinStJeorBmr('female', 60, 165, 25)).toBeCloseTo(1345.25);
    });
});

describe('calculateCalories', () => {
    it('applies activity multiplier and goal adjustment', () => {
        const r = calculateCalories({ age: 30, sex: 'male', weightKg: 80, heightCm: 180, activityLevel: 'moderate', goal: 'lose' });
        expect(r.bmr).toBe(1780);
        expect(r.tdee).toBe(Math.round(1780 * 1.55)); // 2759
        expect(r.targetKcal).toBe(2759 - 500);
    });

    it('never goes below the minimum safe target', () => {
        const r = calculateCalories({ age: 70, sex: 'female', weightKg: 40, heightCm: 145, activityLevel: 'sedentary', goal: 'lose' });
        expect(r.targetKcal).toBe(1200);
    });

    it('macros add up to roughly the target', () => {
        const r = calculateCalories({ age: 25, sex: 'female', weightKg: 60, heightCm: 168, activityLevel: 'light', goal: 'maintain' });
        const total = r.macros.proteinKcal + r.macros.fatKcal + r.macros.carbsKcal;
        expect(Math.abs(total - r.targetKcal)).toBeLessThanOrEqual(10);
        expect(r.macros.proteinG).toBe(96); // 1.6 g/kg
    });

    it('rejects out-of-range input', () => {
        expect(() =>
            calculateCalories({ age: 5, sex: 'male', weightKg: 80, heightCm: 180, activityLevel: 'moderate', goal: 'gain' }),
        ).toThrow(ValidationError);
        expect(() =>
            calculateCalories({ age: 30, sex: 'male', weightKg: NaN, heightCm: 180, activityLevel: 'moderate', goal: 'gain' }),
        ).toThrow(ValidationError);
    });

    it('carbs never negative', () => {
        expect(macroSplit(1200, 150, 'gain').carbsG).toBeGreaterThanOrEqual(0);
    });
});

describe('US Navy body fat', () => {
    it('male reference value', () => {
        // height 180, neck 38, waist 85 → ≈ 15.8 %
        expect(navyBodyFatPercent({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 85 })).toBeCloseTo(15.8, 0);
    });

    it('female reference value', () => {
        // height 165, neck 32, waist 70, hip 95 → ≈ 25 %
        const v = navyBodyFatPercent({ sex: 'female', heightCm: 165, neckCm: 32, waistCm: 70, hipCm: 95 });
        expect(v).toBeGreaterThan(22);
        expect(v).toBeLessThan(28);
    });

    it('requires hip for women and waist > neck', () => {
        expect(() => navyBodyFatPercent({ sex: 'female', heightCm: 165, neckCm: 32, waistCm: 70 })).toThrow(ValidationError);
        expect(() => navyBodyFatPercent({ sex: 'male', heightCm: 180, neckCm: 40, waistCm: 40 })).toThrow(ValidationError);
    });

    it('categorises per ACE', () => {
        expect(bodyFatCategory('male', 4)).toBe('essential');
        expect(bodyFatCategory('male', 10)).toBe('athletes');
        expect(bodyFatCategory('male', 15.8)).toBe('fitness');
        expect(bodyFatCategory('male', 20)).toBe('average');
        expect(bodyFatCategory('male', 30)).toBe('obese');
        expect(bodyFatCategory('female', 24)).toBe('fitness');
        expect(bodyFatCategory('female', 33)).toBe('obese');
    });
});
