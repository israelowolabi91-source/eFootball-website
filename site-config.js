(function (root, factory) {
    'use strict';

    const config = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = config;
    if (root) root.LEAGUE_CONFIG = config;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const tiers = [
        { id: 'developing', name: 'Developing', min: 0, max: 1099, className: 'tier-developing' },
        { id: 'competitive', name: 'Competitive', min: 1100, max: 1399, className: 'tier-competitive' },
        { id: 'elite', name: 'Elite', min: 1400, max: 1749, className: 'tier-elite' },
        { id: 'premier', name: 'Premier', min: 1750, max: null, className: 'tier-elite' }
    ];

    return Object.freeze({
        elo: Object.freeze({ initialRating: 1000, rankedKFactor: 32, cupKFactor: 32, placementKFactor: 16 }),
        tiers: Object.freeze(tiers.map((tier) => Object.freeze(tier))),
        getTier(rating) {
            const value = Number(rating);
            return tiers.slice().reverse().find((tier) => value >= tier.min) || tiers[0];
        },
        calculateEloChange(rating, opponentRating, actualScore, kFactor) {
            const expectedScore = 1 / (1 + (10 ** ((Number(opponentRating) - Number(rating)) / 400)));
            return Math.round(Number(kFactor) * (Number(actualScore) - expectedScore));
        },
        formatTierRange(tier) {
            if (!tier) return '';
            if (tier.max === null) return `${tier.min.toLocaleString()}+ rating`;
            if (tier.min === 0) return `Below ${(tier.max + 1).toLocaleString()} rating`;
            return `${tier.min.toLocaleString()}–${tier.max.toLocaleString()} rating`;
        }
    });
}));
