/* Розрахунок рейтингу за правилами рейтингової системи ФНТУ.
 * https://www.uttf.com.ua/docs/ranking-rules
 *
 * Позначення:
 *   R — рейтинг, N — вага, K — коефіцієнт змагань,
 *   P — сума внесків перемог, S — сума внесків поразок (за модулем).
 *   ΔR = (P - S) * 10 / min(40, N + P + S) * K
 *   Новий гравець (без рейтингу): стартує з опорного рейтингу і нульовою вагою;
 *   з корекцією: ΔR = (P - S - 2) * 10 / min(40, P + S) * K.
 */
(function (root) {
  'use strict';

  var MAX_CONTEST_WEIGHT = 20;
  var MAX_WEIGHT_IN_FORMULA = 40;

  /** Внесок однієї зустрічі: додатний за перемогу, від'ємний за поразку. */
  function matchContribution(myRating, match) {
    var gap, points;
    if (match.won) {
      if (match.opponentRating <= 0) return 0; // перемога над гравцем без рейтингу не враховується
      gap = myRating - match.opponentRating;  // > 0: переміг слабшого
      points = gap >= 0 ? tier(gap) : bonus(-gap);
      return points;
    }
    if (myRating <= 0) return 0;
    gap = match.opponentRating - myRating;     // >= 0: програв сильнішому
    points = gap >= 0 ? tier(gap) : bonus(-gap);
    return -points;
  }

  /** Внесок, коли переможець (або сильніший) має більший чи рівний рейтинг. */
  function tier(gap) {
    if (gap <= 2) return 2;
    if (gap <= 20) return 1;
    return 0;
  }

  /** Внесок, коли результат несподіваний: (різниця + 5) / 3, округлено. */
  function bonus(gap) {
    return Math.round((gap + 5) / 3);
  }

  /** Опорний рейтинг: менше з (найвищий серед переможених, найнижчий серед тих, кому програв). */
  function baseRating(matches) {
    var wins = matches.filter(function (m) { return m.won; }).map(function (m) { return m.opponentRating; });
    var losses = matches.filter(function (m) { return !m.won; }).map(function (m) { return m.opponentRating; });
    if (!wins.length) return 0;
    var highestWin = Math.max.apply(null, wins);
    return losses.length ? Math.min(highestWin, Math.min.apply(null, losses)) : highestWin;
  }

  /**
   * @param {{rating:number, weight:number, factor:number, matches:{opponentRating:number, won:boolean}[],
   *          newPlayerCorrection?:boolean}} input
   */
  function calculate(input) {
    var isNew = input.rating <= 0;
    var startRating = isNew ? baseRating(input.matches) : input.rating;
    var startWeight = isNew ? 0 : input.weight;

    var contributions = input.matches.map(function (m) { return matchContribution(startRating, m); });
    var balance = contributions.reduce(function (a, c) { return a + c; }, 0);                 // P - S
    var turnover = contributions.reduce(function (a, c) { return a + Math.abs(c); }, 0);      // P + S
    var contestWeight = Math.min(MAX_CONTEST_WEIGHT, turnover);
    var endWeight = startWeight + contestWeight;

    var delta = 0;
    var noActivity = round1(startWeight) === 0 && round1(contestWeight) === 0;
    if (!noActivity) {
      var numerator = balance - (isNew && input.newPlayerCorrection ? 2 : 0);
      delta = input.factor * numerator * 10 / Math.min(MAX_WEIGHT_IN_FORMULA, endWeight);
    }

    return {
      isNew: isNew,
      startRating: startRating,
      startWeight: startWeight,
      contributions: contributions,
      balance: balance,
      endRating: Math.max(0, startRating + delta),
      delta: delta,
      endWeight: endWeight
    };
  }

  function round1(x) {
    return Math.round(x * 10) / 10;
  }

  var api = { calculate: calculate, round1: round1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RatingCalc = api;
})(this);
