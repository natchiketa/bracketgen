import _ from "lodash";

export class MainController {
  constructor ($log) {
    'ngInject';

    this.$log = $log;

    this.knownBrackets = [2, 4, 8, 16, 32, 64, 128, 256, 512];
    this.exampleTeams = ["New Jersey Devils", "New York Islanders", "New York Rangers", "Philadelphia Flyers", "Pittsburgh Penguins", "Boston Bruins", "Buffalo Sabres", "Montreal Canadiens", "Ottawa Senators", "Toronto Maple Leafs", "Carolina Hurricanes", "Florida Panthers", "Tampa Bay Lightning", "Washington Capitals", "Winnipeg Jets", "Chicago Blackhawks", "Columbus Blue Jackets", "Detroit Red Wings", "Nashville Predators", "St. Louis Blues", "Calgary Flames", "Colorado Avalanche", "Edmonton Oilers", "Minnesota Wild", "Vancouver Canucks", "Anaheim Ducks", "Dallas Stars", "Los Angeles Kings", "Phoenix Coyotes", "San Jose Sharks", "Montreal Wanderers", "Quebec Nordiques", "Hartford Whalers"]; // because a bracket needs some teams!

    this.seedslist = this.seedslist || this.exampleTeams.slice(0, 27).join('\n');

    this.bracketSizing = 'list';

    this.onSizeChange();
  }

  setBracket() {
    this.bracket = this.getRoundsAndMatchesTree(this.getBaseSize() - 1);
    this.setTeamsForBracket(this.bracket);
  }

  getRoundsAndMatchesTree(numMatches = (this.getSize() - 1)) {
    let matchDepth = 1; // (i.e. # of matches in the current round)
    let matchSeq = numMatches;
    let matchesAdded = 0;

    let rounds = _.times(this.numRounds(numMatches), () => []);

    // Iterate through rounds backwards to do binary tree traversal
    for(let ri = rounds.length - 1; ri >= 0; ri--) {
      let matchesLeft = numMatches - matchesAdded;
      let matchesInRound = Math.min(matchesLeft, matchDepth);

      // Counting backwards, so technically the first to be added in the round
      // is the one with the highest sequence values, so this means first in
      // terms of lowest value
      let firstInThisRound = Math.max(0, (matchSeq - matchDepth)) + 1;
      let firstInNextRound = firstInThisRound + matchesInRound;

      _.times(matchesInRound, () => {
        let nextOffset = (matchSeq - firstInThisRound) / 2;
        let nextMatch = Math.floor(firstInNextRound + nextOffset);
        let nextMatchSeat = Math.round((firstInNextRound + nextOffset) - nextMatch);

        let match = {
          seq: matchSeq,
          next: nextMatch > numMatches ? null : nextMatch,
          nextSeat: nextMatchSeat,
          round: ri+1,
          teams: []
        };

        match.emptyLevel = this.getEmptyLevel(rounds, match);

        rounds[ri].unshift(match);

        matchSeq--;
      })

      matchesAdded += matchesInRound;

      matchDepth *= 2;
    }

    return rounds;
  }

  getMatchups() {
    let seeds = this.getSeedsBaseList(this.seeds);
    let matchups = [];
    let ix = seeds.length;

    while(_.some(seeds) && ix > 0) {
      let matchup = this.getMiddlemostMatchup(seeds, false);

      matchups.push(matchup);

      let m1Idx = seeds.indexOf(matchup[0]);
      let m2Idx = seeds.indexOf(matchup[1]);

      _.each([m1Idx, m2Idx], (i) => {
        seeds.splice(i, 1, undefined);
      });

      ix--;
    }

    matchups = _.sortBy(matchups, (mu) => mu[0].rank);

    this.$log.debug(matchups);

    return matchups;
  }

  /*eslint-disable */
  setSeqForMatches(bracket) {
    seqCount = _.maxBy(bracket, (m) => m.seq).seq;

    oldNexts = [];

    this.bracketMap((match) => {
      let oldNext = _.find(oldNexts, (om) => om.oldSeq === match.next);

      if(oldLeadup) {
        match.next = oldNext.newSeq;
      }

      if(match.round > 1) {
        oldNexts.push({
          oldSeq: match.seq,
          newSeq: seqCount
        });
      }

      match.seq = seqCount;

      return match;
    }, bracket, true);
  }

  /*eslint-disable */
  setTeamsForBracket(bracket, matchups = this.getMatchups()) {
    _.each(matchups, (teams) => {
      this.setTeamsForMatch(bracket, teams);
    });
  }

  setTeamsForMatch(bracket, teams, roundIdx = 0) {
    if(!_.every([bracket, teams])) {
      return;
    }

    let bye = _.isUndefined(teams[1]);
    let firstRoundIdx = bye ? roundIdx + 1 : roundIdx;
    let matchSeq = this.firstMatchInLargestEmptyFinals(bracket, firstRoundIdx).seq;

    for(let ri=firstRoundIdx; ri>=0; ri--) {
      for(let mi=0; mi<bracket[ri].length; mi++) {
        if(_.get(bracket[ri][mi], 'seq') == matchSeq) {
          bracket[ri][mi].teams = teams;

          this.bracketMap((match) => {
            match.emptyLevel = this.getEmptyLevel(bracket, match);
            return match;
          }, bracket, true);

          if(!bye) {
            return;
          }
        }

        if(_.get(bracket[ri][mi], 'next') == matchSeq) {
          bracket[ri][mi].bye = true;

          return;
        }
      }
    }
  }

  firstMatchInLargestEmptyFinals(bracket, roundIdx, forBye = false) {
    let matches = bracket[roundIdx];

    if(forBye) {
      let byeGroups = this.getByeMatchGroups(bracket, roundIdx);
      matches = _.filter(matches, (m) => !_.includes(byeGroups, m.next));
    }

    let firstSeq = matches[0].seq;
    let preferredStart = this.lastSetMatchInRound(bracket, roundIdx).seq;

    let largestAfterStartSeq = _.maxBy(matches, (m) => {
      return (m.seq < preferredStart || m.bye) ? -1 : this.getEmptyLevel(bracket, m);
    });

    let largestOverall = _.maxBy(matches, (m) => {
      return (m.seq < firstSeq || m.bye) ? -1 : this.getEmptyLevel(bracket, m);
    });

    let firstMax;

    if(largestAfterStartSeq.emptyLevel >= largestOverall.emptyLevel) {
      firstMax = largestAfterStartSeq;
    }
    else {
      firstMax = largestOverall;
    }

    return firstMax;
  }


  lastSetMatchInRound(bracket, roundIdx) {
    let matches = bracket[roundIdx];

    let lastSet = _.maxBy(matches, (m) => {
      if(_.isEmpty(m.teams)) {
        return -1;
      }

      return m.teams[0].rank;
    });

    return lastSet;
  }

  getByeMatchGroups(bracket, roundIdx) {
    let matches = bracket[roundIdx];

    return _(matches)
      .groupBy((m) => m.next)
      .filter((group) => _.some(group, (m) => m.bye == true))
      .flatten()
      .map((m) => m.next)
      .uniq()
      .value()
  }

  getEmptyLevel(bracket, match) {
    let emptyLevel = 0;
    let matches = [match];

    let allEmpty = _.isEmpty(match.teams) && !match.bye;
    if(allEmpty == false && _.isEmpty(match.teams[1])) {
      emptyLevel = !!match.bye ? 0 : emptyLevel = 0.5;
    }

    let i = 0;
    let parent;
    while(allEmpty && i<bracket.length) {
      parent = this.getLaterMatch(bracket, match, emptyLevel);

      // Handle first parent traversal: involves match, parent and sibling
      // match (other match in this round going to the same next match)
      if(parent && parent.seq === match.next && !_.isEmpty(parent.teams)) {
        // Mark the parent as empty if the corresponding seat for this match
        // is empty.
        if(match.nextSeat === 1 && _.isEmpty(parent.teams[1])) {
          emptyLevel++;
          i++;
          continue;
        }
        else {
          allEmpty = false;
          i++;
          continue;
        }
      }

      let parentsAndSiblings = [parent];

      try{
        this.bracketEach((bMatch) => {
          if(bMatch.round < match.round) {
            return;
          }

          if(_(parentsAndSiblings).map((m) => m.seq).includes(bMatch.next)) {
            parentsAndSiblings.push(bMatch);
          }
        }, bracket, true);

        matches = _.union(matches, parentsAndSiblings);
        allEmpty = _.every(matches, (m) => _.isEmpty(m.teams));
      }
      catch (e) {
        allEmpty = false;
      }

      if(allEmpty) {
        emptyLevel++;
      }

      i++;
    }

    return emptyLevel;
  }

  getLaterMatch(bracket, currentMatch, depth = 1) {
    let parent = currentMatch;
    let nextRoundIdx = currentMatch.round;

    for(let i=0; i<depth; i++) {
      parent = _.find(bracket[nextRoundIdx+i], (m) => m.seq === parent.next);
    }

    return parent;
  }

  getMatchesBefore(bracket, seq) {
    let matches = [];

    for(let ri=0; ri<bracket.length; ri++) {
      for(let mi=0; mi<bracket[ri].length; mi++) {
        if(bracket[ri][mi].next === seq) {
          matches.push(bracket[ri][mi]);
        }
      }
    }

    return matches;
  }
  /*eslint-enable */

  updateSeeds() {
    let list;

    if(this.bracketSizing === 'list') {
      list = this.seedslist.split('\n');

      if(list.length < 4) {
        list = _.map(_.times(4), (n) => `Team ${n+1}`);
        this.seedslist = list.join('\n');
      }

      this.size = list.length;
    }
    else if (this.bracketSizing === 'range') {
      this.size = parseInt(_.get(this, 'size', 4));
      list = _.map(_.times(this.size), (n) => `Team ${n+1}`);
    }

    this.seeds = list;

    return list;
  }

  getSeedsBaseList(seeds = this.seeds) {
    let base = this.getBaseSize();
    let baselist = _.map(_.times(base), (n) => _.get(seeds, n));

    return _.map(baselist, (el, idx) => el && {name: el, rank: idx+1});
  }

  getMiddlemostMatchup(seeds = this.getSeedsBaseList(this.seeds), opponent = true) {
    let base = this.getBaseSize();
    let depth = 1;
    let matchup;

    for(let rank=base/2; rank>=0; rank--) {
      matchup = [
        this.getSeedWithRank(seeds, rank),
        this.getSeedWithRank(seeds, rank + depth)
      ];

      if(opponent && _.every(matchup)) {
        break;
      }
      else if (!opponent && !_.isUndefined(matchup[0])) {
        break;
      }

      depth += 2;
    }

    this.$log.debug(matchup);
    return matchup;
  }

  hasOpponent(seeds, rank, depth) {
    let p1 = this.getSeedWithRank(seeds, rank);
    let p2 = this.getSeedWithRank(seeds, rank + depth);

    return !_.isUndefined(p1) && !_.isUndefined(p2);
  }

  getSeedWithRank(seeds, rank) {
    return _.find(seeds, (s) => _.get(s, 'rank') === rank);
  }

  getOpponentWithRank(seeds, rank, depth) {
    return this.getSeedWithRank(seeds, rank + depth);
  }

  onSizeChange() {
    this.updateSeeds();
    this.setBracket();
  }

  fontSize() {
    return Math.max(2, (16 / this.size)) + 'vw';
  }

  getSize() {
    if(typeof this.size === 'undefined') {
      this.updateSeeds();
    }

    return this.size;
  }

  getBaseSize() {
    let size = this.getSize();

    let baseSize = _.find(this.knownBrackets, (k) => k >= size);

    return baseSize;
  }

  numByes() {
    return this.getBaseSize() - this.getSize();
  }

  numRounds(base = this.getBaseSize()) {
    'ngInject';

    let rounds = 1;
    let teams = 0;
    let matches = 0;

    let nextRounds = 1;

    while(matches < base) {
      rounds = nextRounds;
      matches = (teams += Math.pow(2, nextRounds++)) / 2;
    }

    return rounds;
  }

  bracketMap(fn, bracket = this.bracket, reverse = false) {
    let rIdxs = _.range(bracket.length);
    let mIdxs;

    if(_.isFunction(fn)) {
      rIdxs = reverse ? rIdxs.reverse() : rIdxs;

      _.each(rIdxs, (ri) => {
        mIdxs = _.range(bracket[ri].length);
        mIdxs = reverse ? mIdxs.reverse() : mIdxs;

        _.each(mIdxs, (mi) => {
          bracket[ri][mi] = fn(bracket[ri][mi]);
        });
      });
    }
  }

  bracketEach(fn, bracket = this.bracket, reverse = false) {
    let rIdxs = _.range(bracket.length);
    let mIdxs;

    if(_.isFunction(fn)) {
      rIdxs = reverse ? rIdxs.reverse() : rIdxs;

      _.each(rIdxs, (ri) => {
        mIdxs = _.range(bracket[ri].length);
        mIdxs = reverse ? mIdxs.reverse() : mIdxs;

        _.each(mIdxs, (mi) => {
          fn(bracket[ri][mi]);
        });
      });
    }
  }
}
