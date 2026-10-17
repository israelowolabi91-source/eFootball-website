const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.navigation');

if (menuToggle && navigation) {
	menuToggle.addEventListener('click', () => {
		const isOpen = navigation.classList.toggle('is-open');
		menuToggle.setAttribute('aria-expanded', String(isOpen));
	});
}

const ONBOARDING_KEY = 'timLeagueOnboardingComplete';
const onboardingDialog = document.querySelector('#onboarding-dialog');
const onboardingHelp = document.querySelector('#onboarding-help');
const onboardingTitle = document.querySelector('#onboarding-title');
const onboardingDescription = document.querySelector('#onboarding-description');
const onboardingStepCount = document.querySelector('#onboarding-step-count');
const onboardingProgress = document.querySelector('#onboarding-progress');
const onboardingProgressFill = document.querySelector('#onboarding-progress-fill');
const onboardingStepLinks = document.querySelector('#onboarding-step-links');
const onboardingNext = document.querySelector('#onboarding-next');
const onboardingBack = document.querySelector('#onboarding-back');
const onboardingSkip = document.querySelector('#onboarding-skip');
const onboardingClose = document.querySelector('#onboarding-close');

const onboardingSteps = [
	{
		kicker: 'WELCOME · 01 / 04',
		title: 'Hey, player! Ready to get started?',
		description: 'I’m Kicki, your league guide. I’ll show you where to find events, follow matches, and check your progress. It only takes a moment.',
		links: []
	},
	{
		kicker: 'YOUR DASHBOARD · 02 / 04',
		title: 'This is your home base.',
		description: 'Your dashboard brings together quick links to tournaments, rankings, and match information. Preview stats are examples, so use each dedicated page for its own guidance.',
		links: [
			{ label: 'See dashboard quick links', href: '#quick-actions', icon: '↓' }
		]
	},
	{
		kicker: 'FIND YOUR GAME · 03 / 04',
		title: 'Choose an event that fits you.',
		description: 'Visit Tournaments to compare event formats and find out how to enter. Check the organiser’s instructions before planning or joining an event.',
		links: [
			{ label: 'Explore tournaments', href: 'tournaments.html', icon: '↗' },
			{ label: 'Learn how to play', href: 'play.html', icon: '↗' }
		]
	},
	{
		kicker: 'FOLLOW YOUR SEASON · 04 / 04',
		title: 'Keep an eye on every result.',
		description: 'The Match Centre explains fixtures and result reporting. Rankings shows a leaderboard preview. Both pages clearly label content that is not live league data.',
		links: [
			{ label: 'Open Match Centre', href: 'matches.html', icon: '↗' },
			{ label: 'Explore rankings', href: 'rankings.html', icon: '↗' }
		]
	}
];
let activeOnboardingStep = 0;

const renderOnboardingStep = () => {
	if (!onboardingDialog) return;
	const step = onboardingSteps[activeOnboardingStep];
	if (!step) return;

	if (onboardingTitle) onboardingTitle.textContent = step.title;
	if (onboardingDescription) onboardingDescription.textContent = step.description;
	if (onboardingStepCount) onboardingStepCount.textContent = step.kicker;
	if (onboardingProgress) onboardingProgress.setAttribute('aria-valuenow', String(activeOnboardingStep + 1));
	if (onboardingProgressFill) onboardingProgressFill.style.width = `${((activeOnboardingStep + 1) / onboardingSteps.length) * 100}%`;
	if (onboardingNext) {
		const isLastStep = activeOnboardingStep === onboardingSteps.length - 1;
		onboardingNext.innerHTML = isLastStep ? 'Finish tour <span aria-hidden="true">✓</span>' : activeOnboardingStep === 0 ? 'Show me around <span aria-hidden="true">→</span>' : 'Next <span aria-hidden="true">→</span>';
	}
	if (onboardingBack) onboardingBack.hidden = activeOnboardingStep === 0;
	if (onboardingSkip) onboardingSkip.hidden = activeOnboardingStep === onboardingSteps.length - 1;

	if (onboardingStepLinks) {
		onboardingStepLinks.replaceChildren();
		step.links.forEach((link) => {
			const anchor = document.createElement('a');
			anchor.href = link.href;
			anchor.textContent = link.label;
			const icon = document.createElement('span');
			icon.setAttribute('aria-hidden', 'true');
			icon.textContent = link.icon;
			anchor.append(icon);
			anchor.addEventListener('click', finishOnboarding);
			onboardingStepLinks.append(anchor);
		});
	}
};

const openOnboarding = () => {
	if (!onboardingDialog) return;
	activeOnboardingStep = 0;
	renderOnboardingStep();
	if (!onboardingDialog.open) onboardingDialog.showModal();
	onboardingNext?.focus();
};

const finishOnboarding = () => {
	if (!onboardingDialog) return;
	localStorage.setItem(ONBOARDING_KEY, 'true');
	if (onboardingDialog.open) onboardingDialog.close();
	onboardingHelp?.focus();
};

if (onboardingDialog) {
	onboardingNext?.addEventListener('click', () => {
		if (activeOnboardingStep === onboardingSteps.length - 1) {
			finishOnboarding();
			return;
		}
		activeOnboardingStep += 1;
		renderOnboardingStep();
		onboardingNext?.focus();
	});

	onboardingBack?.addEventListener('click', () => {
		activeOnboardingStep = Math.max(0, activeOnboardingStep - 1);
		renderOnboardingStep();
		(activeOnboardingStep === 0 ? onboardingNext : onboardingBack)?.focus();
	});

	onboardingSkip?.addEventListener('click', finishOnboarding);
	onboardingClose?.addEventListener('click', finishOnboarding);
	onboardingDialog.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			finishOnboarding();
		}
	});
	onboardingDialog.addEventListener('cancel', (event) => {
		event.preventDefault();
		finishOnboarding();
	});
	onboardingHelp?.addEventListener('click', () => openOnboarding());
}

const notificationsToggle = document.querySelector('#notifications-toggle');
const notificationsPanel = document.querySelector('#notifications-panel');

if (notificationsToggle && notificationsPanel) {
	const setNotificationsOpen = (isOpen) => {
		notificationsPanel.hidden = !isOpen;
		notificationsToggle.setAttribute('aria-expanded', String(isOpen));
		notificationsToggle.setAttribute('aria-label', isOpen ? 'Close notifications' : 'Open notifications');
	};

	notificationsToggle.addEventListener('click', () => {
		setNotificationsOpen(notificationsPanel.hidden);
	});

	document.addEventListener('click', (event) => {
		if (!notificationsPanel.hidden && !notificationsPanel.contains(event.target) && !notificationsToggle.contains(event.target)) {
			setNotificationsOpen(false);
		}
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && !notificationsPanel.hidden) {
			setNotificationsOpen(false);
			notificationsToggle.focus();
		}
	});
}

const tournamentCards = document.querySelector('#tournament-cards');
const tournamentSearch = document.querySelector('#tournament-search');
const tournamentSort = document.querySelector('#tournament-sort');
const tournamentEmpty = document.querySelector('#tournament-empty');
const tournamentFilters = document.querySelectorAll('[data-tournament-filter]');

if (tournamentCards && tournamentSearch && tournamentSort && tournamentEmpty && tournamentFilters.length) {
	let activeTournamentFilter = 'all';
	const tournamentItems = [...tournamentCards.querySelectorAll('.event-card')];
	const tournamentResultCount = document.querySelector('#tournament-result-count');
	const originalOrder = new Map(tournamentItems.map((card, index) => [card, index]));

	const updateTournamentList = () => {
		const query = tournamentSearch.value.trim().toLocaleLowerCase();
		const visibleItems = tournamentItems.filter((card) => {
			const matchesStatus = activeTournamentFilter === 'all' || card.dataset.status === activeTournamentFilter;
			const matchesSearch = (card.dataset.name || '').includes(query);
			card.hidden = !matchesStatus || !matchesSearch;
			return !card.hidden;
		});

		if (tournamentSort.value === 'name') {
			visibleItems.sort((a, b) => (a.dataset.name || '').localeCompare(b.dataset.name || ''));
		} else if (tournamentSort.value === 'slots') {
			visibleItems.sort((a, b) => Number(b.dataset.slots || 0) - Number(a.dataset.slots || 0));
		} else {
			visibleItems.sort((a, b) => originalOrder.get(a) - originalOrder.get(b));
		}

		visibleItems.forEach((card) => tournamentCards.append(card));
		tournamentEmpty.hidden = visibleItems.length > 0;
		if (tournamentResultCount) {
			tournamentResultCount.textContent = `Showing ${visibleItems.length} of ${tournamentItems.length} events.`;
		}
	};

	tournamentFilters.forEach((filter) => {
		filter.addEventListener('click', () => {
			activeTournamentFilter = filter.dataset.tournamentFilter || 'all';
			tournamentFilters.forEach((item) => {
				const selected = item === filter;
				item.classList.toggle('is-selected', selected);
				item.setAttribute('aria-pressed', String(selected));
			});
			updateTournamentList();
		});
	});

	tournamentSearch.addEventListener('input', updateTournamentList);
	tournamentSort.addEventListener('change', updateTournamentList);
}

const openLinkedEventDetails = () => {
	const targetId = window.location.hash.slice(1);
	const target = document.getElementById(targetId);
	if (target instanceof HTMLDetailsElement) target.open = true;
};

openLinkedEventDetails();
window.addEventListener('hashchange', openLinkedEventDetails);

const challengeRoll = document.querySelector('#roll-spooky-challenge');
const challengeResult = document.querySelector('#challenge-result');

if (challengeRoll && challengeResult) {
	const friendlyChallenges = [
		'The Phantom Press — Try a high press for the first 10 in-game minutes. Then switch back to your normal tactics.',
		'One-Touch Spell — For your next attack, try to keep the ball moving with first-time passes.',
		'Underdog Curse — Pick a team you do not usually play with and see how long you can keep a clean sheet.',
		'The Comeback Cauldron — If you go behind, make one tactical change at half-time and try to turn it around.',
		'Crossbar Spectre — Each player gets one bonus point for hitting the crossbar. Celebrate dramatically.',
		'No-Star Night — Pick a squad without your usual star player and let someone new take the spotlight.'
	];
	let previousChallenge = -1;

	challengeRoll.addEventListener('click', () => {
		let challengeIndex = Math.floor(Math.random() * friendlyChallenges.length);
		if (friendlyChallenges.length > 1 && challengeIndex === previousChallenge) {
			challengeIndex = (challengeIndex + 1) % friendlyChallenges.length;
		}
		previousChallenge = challengeIndex;
		challengeResult.textContent = friendlyChallenges[challengeIndex];
		challengeResult.classList.remove('challenge-result-pop');
		window.requestAnimationFrame(() => challengeResult.classList.add('challenge-result-pop'));
	});
}

const rankingSearch = document.querySelector('#ranking-search');
const rankingDivision = document.querySelector('#ranking-division');
const rankingSort = document.querySelector('#ranking-sort');
const rankingCount = document.querySelector('#leaderboard-count');
const leaderboardEmpty = document.querySelector('#leaderboard-empty');
const rankingTabs = document.querySelectorAll('[data-ranking-view]');

if (rankingSearch && rankingDivision && rankingSort && rankingCount && leaderboardEmpty && rankingTabs.length) {
	const rankingBodies = {
		players: document.querySelector('#player-rankings'),
		clubs: document.querySelector('#club-rankings')
	};
	const rankingOrder = new Map(
		Object.values(rankingBodies)
			.filter(Boolean)
			.map((body) => [body, new Map([...body.querySelectorAll('tr')].map((row, index) => [row, index]))])
	);
	let activeRankingView = 'players';

	const updateLeaderboard = () => {
		const body = rankingBodies[activeRankingView];
		if (!body) return;

		const query = rankingSearch.value.trim().toLocaleLowerCase();
		const division = rankingDivision.value;
		const rows = [...body.querySelectorAll('tr')];
		const visibleRows = rows.filter((row) => {
			const matchesSearch = (row.dataset.name || '').includes(query);
			const matchesDivision = division === 'all' || row.dataset.division === division;
			row.hidden = !matchesSearch || !matchesDivision;
			return !row.hidden;
		});

		const sortKey = rankingSort.value;
		if (sortKey !== 'default') {
			visibleRows.sort((a, b) => Number(b.dataset[sortKey]) - Number(a.dataset[sortKey]));
		} else {
			visibleRows.sort((a, b) => rankingOrder.get(body).get(a) - rankingOrder.get(body).get(b));
		}

		visibleRows.forEach((row) => body.append(row));
		rankingCount.textContent = `Showing ${visibleRows.length} ${activeRankingView === 'players' ? 'players' : 'clubs'}`;
		leaderboardEmpty.hidden = visibleRows.length > 0;
	};

	rankingTabs.forEach((tab) => {
		tab.addEventListener('click', () => {
			activeRankingView = tab.dataset.rankingView === 'clubs' ? 'clubs' : 'players';
			rankingTabs.forEach((item) => {
				const selected = item === tab;
				item.classList.toggle('is-active', selected);
				item.setAttribute('aria-selected', String(selected));
			});

			Object.entries(rankingBodies).forEach(([view, body]) => {
				if (body) body.hidden = view !== activeRankingView;
			});
			const colSubject = document.querySelector('#col-subject');
			const colRating = document.querySelector('#col-rating');
			const colRecord = document.querySelector('#col-record');
			const colMatches = document.querySelector('#col-matches');
			if (colSubject) colSubject.textContent = activeRankingView === 'players' ? 'Player' : 'Club';
			if (colRating) colRating.textContent = activeRankingView === 'players' ? 'Elo rating' : 'Club points';
			if (colRecord) colRecord.textContent = activeRankingView === 'players' ? 'Ranked W–D–L' : 'Record W–D–L';
			if (colMatches) colMatches.textContent = activeRankingView === 'players' ? 'Ranked matches' : 'Total matches';
			updateLeaderboard();
		});
	});

	rankingSearch.addEventListener('input', updateLeaderboard);
	rankingDivision.addEventListener('change', updateLeaderboard);
	rankingSort.addEventListener('change', updateLeaderboard);
	if (rankingBodies.players) {
		const note = document.querySelector('#rank-data-note');
		const body = rankingBodies.players;
		body.replaceChildren();
		const loading = document.createElement('tr');
		const loadingCell = document.createElement('td');
		loadingCell.colSpan = 5;
		loadingCell.textContent = 'Loading player profile ratings…';
		loading.dataset.name = '';
		loading.dataset.division = 'all';
		loading.append(loadingCell);
		body.append(loading);
		fetch('/api/rankings/live', { credentials: 'same-origin' })
			.then(async (response) => {
				const result = await response.json().catch(() => ({}));
				if (!response.ok) throw new Error(result.message || 'Live player rankings are temporarily unavailable.');
				return result;
			})
			.then((result) => {
				body.replaceChildren();
				(result.players || []).forEach((player) => {
					const row = document.createElement('tr');
					const ratedMatches = Number(player.rankedMatches) || 0;
					const total = player.wins + player.draws + player.losses;
					const winRate = total ? Math.round((player.wins / total) * 100) : 0;
					const ratingNum = Number(player.rating) || 1000;
					const playerDivision = ratingNum >= 1400 ? 'elite' : ratingNum >= 1100 ? 'competitive' : 'developing';
					Object.assign(row.dataset, {
						name: player.gamerTag.toLocaleLowerCase(),
						division: playerDivision,
						rating: String(ratingNum),
						wins: String(player.wins),
						winrate: String(winRate)
					});
					const rankCell = document.createElement('td');
					const rank = document.createElement('span');
					rank.className = `rank-position${player.rank === 1 ? ' rank-gold' : player.rank === 2 ? ' rank-silver' : player.rank === 3 ? ' rank-bronze' : ''}`;
					rank.textContent = String(player.rank).padStart(2, '0');
					rankCell.append(rank);
					const playerCell = document.createElement('td');
					const playerLabel = document.createElement('span');
					playerLabel.className = 'rank-player';
					const avatar = document.createElement('span');
					avatar.className = 'rank-avatar avatar-gold';
					avatar.textContent = player.gamerTag.slice(0, 1).toUpperCase();
					const identity = document.createElement('span');
					const name = document.createElement('strong');
					name.textContent = player.gamerTag;
					const detail = document.createElement('small');
					detail.textContent = ratedMatches ? `${ratedMatches} owner-approved ranked matches` : 'No approved ranked matches yet';
					identity.append(name, detail);
					playerLabel.append(avatar, identity);
					playerCell.append(playerLabel);
					const ratingCell = document.createElement('td');
					const rating = document.createElement('strong');
					rating.textContent = Number(player.rating).toLocaleString();
					ratingCell.append(rating);
					const recordCell = document.createElement('td');
					recordCell.textContent = `${player.wins}–${player.draws}–${player.losses}`;
					const matchesCell = document.createElement('td');
					matchesCell.textContent = String(ratedMatches);
					row.append(rankCell, playerCell, ratingCell, recordCell, matchesCell);
					body.append(row);
					rankingOrder.get(body).set(row, player.rank);
				});
				if (note) note.textContent = `Live player-profile Elo standings · ${result.ratingSystem} Ratings and records include owner-approved ranked results only. Club standings remain illustrative previews.`;
				updateLeaderboard();
			})
			.catch((error) => {
				body.replaceChildren();
				const row = document.createElement('tr');
				const cell = document.createElement('td');
				cell.colSpan = 5;
				cell.textContent = error.message;
				row.append(cell);
				body.append(row);
				if (note) note.textContent = 'Live player standings could not be loaded. Club standings remain illustrative previews.';
				rankingCount.textContent = 'Live player rankings unavailable';
				leaderboardEmpty.hidden = true;
			});
	}

	if (rankingBodies.clubs) {
		fetch('/api/site/clubs')
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				const clubs = data?.clubs || data;
				if (!Array.isArray(clubs) || clubs.length === 0) return;
				const body = rankingBodies.clubs;
				body.replaceChildren();
				clubs.forEach((c) => {
					const row = document.createElement('tr');
					const divClass = (c.division || 'premier').toLowerCase();
					row.dataset.name = `${(c.name || '').toLowerCase()} ${(c.captain || '').toLowerCase()}`;
					row.dataset.division = divClass;
					row.dataset.rating = String(c.points || 0);
					const wins = Number(String(c.record || '').split('–')[0]) || 0;
					row.dataset.wins = String(wins);
					row.dataset.winrate = String(c.matches ? Math.round((wins / c.matches) * 100) : 0);

					const rankClass = c.rank === 1 ? ' rank-gold' : c.rank === 2 ? ' rank-silver' : c.rank === 3 ? ' rank-bronze' : '';
					const avatarLetter = (c.name || 'C').charAt(0).toUpperCase();

					row.innerHTML = `
						<td><span class="rank-position${rankClass}">${String(c.rank).padStart(2, '0')}</span></td>
						<td>
							<span class="rank-player">
								<span class="rank-avatar avatar-violet">${avatarLetter}</span>
								<span><strong>${c.name}</strong><small>Captain: ${c.captain}</small></span>
								${c.rank === 1 ? '<span class="rank-badge">✦</span>' : ''}
							</span>
						</td>
						<td><strong>${Number(c.points).toLocaleString()}</strong><small class="rating-change">${c.change || ''}</small></td>
						<td>${c.record}</td>
						<td>${c.matches}</td>
					`;
					body.append(row);
					if (rankingOrder.get(body)) {
						rankingOrder.get(body).set(row, c.rank);
					}
				});
				updateLeaderboard();
			})
			.catch(() => {});
	}
	updateLeaderboard();
}

const readinessChecklist = document.querySelector('#readiness-checklist');

if (readinessChecklist) {
	const readinessItems = [...readinessChecklist.querySelectorAll('.readiness-item')];
	const readinessCount = document.querySelector('#readiness-count');
	const readinessStatus = document.querySelector('#readiness-status');
	const readinessProgress = document.querySelector('#readiness-progress');
	const readinessProgressFill = document.querySelector('#readiness-progress-fill');

	const updateReadiness = () => {
		const checkedCount = readinessItems.filter((item) => item.checked).length;
		const progressPercent = readinessItems.length ? (checkedCount / readinessItems.length) * 100 : 0;

		if (readinessCount) readinessCount.textContent = `${checkedCount} / ${readinessItems.length}`;
		if (readinessStatus) {
			readinessStatus.textContent = checkedCount === readinessItems.length
				? 'All set. You have covered the essentials—follow your event organiser’s final instructions.'
				: 'Tick off what you have checked. Your progress stays on this page until you leave.';
		}
		if (readinessProgress) readinessProgress.setAttribute('aria-valuenow', String(checkedCount));
		if (readinessProgressFill) readinessProgressFill.style.width = `${progressPercent}%`;
	};

	readinessItems.forEach((item) => item.addEventListener('change', updateReadiness));
	updateReadiness();
}

const matchesList = document.querySelector('#matches-list');

if (matchesList) {
	const matchCards = [...matchesList.querySelectorAll('[data-match-card]')];
	const matchFilters = [...document.querySelectorAll('[data-match-filter]')];
	const matchSearch = document.querySelector('#match-search');
	const matchCompetition = document.querySelector('#match-competition');
	const matchSort = document.querySelector('#match-sort');
	const matchCount = document.querySelector('#match-count');
	const matchesEmpty = document.querySelector('#matches-empty');
	const savedMatchCount = document.querySelector('#saved-match-count');
	const savedMatchStatus = document.querySelector('#matches-save-status');
	const resetMatchFilters = document.querySelector('#reset-match-filters');
	const savedMatchesKey = 'timLeagueSavedMatches';
	let activeMatchFilter = 'all';
	let savedMatchIds = [];

	try {
		const storedMatches = JSON.parse(localStorage.getItem(savedMatchesKey) || '[]');
		if (Array.isArray(storedMatches)) {
			savedMatchIds = storedMatches.filter((id) => matchCards.some((card) => card.dataset.matchId === id));
		} else {
			localStorage.removeItem(savedMatchesKey);
		}
	} catch {
		localStorage.removeItem(savedMatchesKey);
	}

	const updateSavedMatchCount = () => {
		if (savedMatchCount) savedMatchCount.textContent = String(savedMatchIds.length).padStart(2, '0');
	};

	const updateMatchList = () => {
		const query = matchSearch?.value.trim().toLocaleLowerCase() || '';
		const competition = matchCompetition?.value || 'all';
		const visibleCards = matchCards.filter((card) => {
			const matchesStatus = activeMatchFilter === 'all'
				|| activeMatchFilter === card.dataset.status
				|| (activeMatchFilter === 'saved' && savedMatchIds.includes(card.dataset.matchId));
			const matchesCompetition = competition === 'all' || card.dataset.competition === competition;
			const matchesQuery = (card.dataset.search || '').toLocaleLowerCase().includes(query);
			card.hidden = !matchesStatus || !matchesCompetition || !matchesQuery;
			return !card.hidden;
		});

		if (matchSort?.value === 'latest') {
			visibleCards.sort((a, b) => Date.parse(b.dataset.date) - Date.parse(a.dataset.date));
		} else if (matchSort?.value === 'competition') {
			visibleCards.sort((a, b) => {
				const competitionOrder = a.dataset.competition.localeCompare(b.dataset.competition);
				return competitionOrder || Date.parse(a.dataset.date) - Date.parse(b.dataset.date);
			});
		} else {
			visibleCards.sort((a, b) => {
				if (a.dataset.status !== b.dataset.status) return a.dataset.status === 'upcoming' ? -1 : 1;
				const dateOrder = Date.parse(a.dataset.date) - Date.parse(b.dataset.date);
				return a.dataset.status === 'upcoming' ? dateOrder : -dateOrder;
			});
		}

		visibleCards.forEach((card) => matchesList.append(card));
		if (matchCount) {
			const label = activeMatchFilter === 'results'
				? 'sample result'
				: activeMatchFilter === 'upcoming'
					? 'fixture preview'
					: activeMatchFilter === 'saved'
						? 'saved preview'
						: 'sample match';
			const pluralSuffix = label.endsWith('match') ? 'es' : 's';
			matchCount.textContent = `Showing ${visibleCards.length} ${label}${visibleCards.length === 1 ? '' : pluralSuffix}`;
		}
		if (matchesEmpty) matchesEmpty.hidden = visibleCards.length > 0;
	};

	matchCards.forEach((card) => {
		const saveButton = card.querySelector('[data-match-save]');
		const matchId = card.dataset.matchId;
		if (!saveButton || !matchId) return;

		const isSaved = savedMatchIds.includes(matchId);
		saveButton.setAttribute('aria-pressed', String(isSaved));
		saveButton.querySelector('.save-button-label').textContent = isSaved ? 'Saved' : 'Save';
		saveButton.querySelector('[aria-hidden="true"]').textContent = isSaved ? '★' : '☆';

		saveButton.addEventListener('click', () => {
			const shouldSave = !savedMatchIds.includes(matchId);
			savedMatchIds = shouldSave
				? [...savedMatchIds, matchId]
				: savedMatchIds.filter((savedId) => savedId !== matchId);
			localStorage.setItem(savedMatchesKey, JSON.stringify(savedMatchIds));
			saveButton.setAttribute('aria-pressed', String(shouldSave));
			saveButton.querySelector('.save-button-label').textContent = shouldSave ? 'Saved' : 'Save';
			saveButton.querySelector('[aria-hidden="true"]').textContent = shouldSave ? '★' : '☆';
			if (savedMatchStatus) {
				savedMatchStatus.textContent = shouldSave
					? 'Example fixture saved on this device only. This does not create an official entry or send a reminder.'
					: 'Example fixture removed from this device’s saved list.';
			}
			updateSavedMatchCount();
			updateMatchList();
		});
	});

	matchFilters.forEach((filter) => {
		filter.addEventListener('click', () => {
			activeMatchFilter = filter.dataset.matchFilter || 'all';
			matchFilters.forEach((item) => {
				const selected = item === filter;
				item.classList.toggle('is-selected', selected);
				item.setAttribute('aria-pressed', String(selected));
			});
			updateMatchList();
		});
	});

	matchSearch?.addEventListener('input', updateMatchList);
	matchCompetition?.addEventListener('change', updateMatchList);
	matchSort?.addEventListener('change', updateMatchList);
	resetMatchFilters?.addEventListener('click', () => {
		activeMatchFilter = 'all';
		if (matchSearch) matchSearch.value = '';
		if (matchCompetition) matchCompetition.value = 'all';
		if (matchSort) matchSort.value = 'upcoming';
		matchFilters.forEach((filter) => {
			const selected = filter.dataset.matchFilter === 'all';
			filter.classList.toggle('is-selected', selected);
			filter.setAttribute('aria-pressed', String(selected));
		});
		updateMatchList();
		matchSearch?.focus();
	});

	updateSavedMatchCount();
	updateMatchList();
}

const challengeStatusMessage = document.querySelector('#challenge-status-message');
const matchAccessStorageKey = 'timLeaguePrivateMatchLinks';
const ownerAccessStorageKey = 'timLeagueOwnerReviewLink';
let directoryPlayers = [];

const readPrivateMatchLinks = () => {
	try {
		const stored = JSON.parse(sessionStorage.getItem(matchAccessStorageKey) || '{}');
		return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
	} catch {
		sessionStorage.removeItem(matchAccessStorageKey);
		return {};
	}
};

const matchApi = async (url, options = {}) => {
	if (window.location.protocol === 'file:' && url.startsWith('/api/')) {
		throw new Error('Player records need the website server. Run "npm start" in the website folder, then open http://localhost:3000/matches.html in Chrome.');
	}
	const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
	const matchId = url.match(/^\/api\/matches\/([^/?]+)/)?.[1];
	const matchLink = matchId && readPrivateMatchLinks()[decodeURIComponent(matchId)];
	if (matchLink?.token && !headers['X-Match-Token']) headers['X-Match-Token'] = matchLink.token;
	const ownerToken = sessionStorage.getItem(ownerAccessStorageKey);
	if (url.startsWith('/api/admin/') && ownerToken && !headers['X-Owner-Review-Token']) headers['X-Owner-Review-Token'] = ownerToken;
	const response = await fetch(url, {
		...options,
		credentials: 'same-origin',
		headers
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(result.message || 'The match service could not complete that request.');
		error.status = response.status;
		throw error;
	}
	return result;
};

const matchMessage = (element, message, isError = false) => {
	if (!element) return;
	element.textContent = message;
	element.classList.toggle('is-error', isError);
};

const makeMatchElement = (tag, className = '', text = '') => {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text) element.textContent = text;
	return element;
};

const formatChallengeTime = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const challengeStatusText = (status) => ({
	pending: 'Invitation awaiting response',
	accepted: 'Accepted · scheduled',
	'awaiting-opponent': 'Score submitted · awaiting opponent',
	disputed: 'Reports differ · owner review',
	'pending-owner': 'Both reports received · owner review',
	approved: 'Result approved',
	rejected: 'Result needs clarification',
	declined: 'Invitation declined',
	cancelled: 'Invitation cancelled'
}[status] || 'Match update');

const playerRatingBand = (rating) => rating >= 1400
	? { key: 'elite', label: 'Elite', className: 'tier-elite' }
	: rating >= 1100
		? { key: 'competitive', label: 'Competitive', className: 'tier-competitive' }
		: { key: 'developing', label: 'Developing', className: 'tier-developing' };

const renderPlayerDirectory = () => {
	const directory = document.querySelector('#player-directory');
	if (!directory) return;
	const search = document.querySelector('#player-search').value.trim().toLocaleLowerCase();
	const ratingBand = document.querySelector('#player-rating-filter').value;
	const experience = document.querySelector('#player-experience-filter').value;
	const sortBy = document.querySelector('#player-sort').value;
	const rankedPlayers = directoryPlayers.filter((player) => player.rankedMatches > 0).length;
	const topRating = directoryPlayers.length ? Math.max(...directoryPlayers.map((player) => player.rating)) : null;
	document.querySelector('#directory-total-players').textContent = String(directoryPlayers.length);
	document.querySelector('#directory-ranked-players').textContent = String(rankedPlayers);
	document.querySelector('#directory-top-rating').textContent = topRating === null ? '—' : topRating.toLocaleString();
	const quickFilter = !search && ratingBand === 'all' && experience === 'all'
		? 'all'
		: !search && ratingBand === 'elite' && experience === 'all'
			? 'elite'
			: !search && ratingBand === 'all' && experience === 'played'
				? 'played'
				: !search && ratingBand === 'all' && experience === 'new'
					? 'new'
					: '';
	document.querySelectorAll('[data-directory-filter]').forEach((button) => {
		const selected = button.dataset.directoryFilter === quickFilter;
		button.classList.toggle('is-active', selected);
		button.setAttribute('aria-pressed', String(selected));
	});
	const players = directoryPlayers.filter((player) => {
		const matchesName = player.gamerTag.toLocaleLowerCase().includes(search);
		const matchesRating = ratingBand === 'all' || playerRatingBand(player.rating).key === ratingBand;
		const hasRankedMatches = player.rankedMatches > 0;
		const matchesExperience = experience === 'all' || (experience === 'played' ? hasRankedMatches : !hasRankedMatches);
		return matchesName && matchesRating && matchesExperience;
	});
	players.sort((a, b) => {
		if (sortBy === 'name') return a.gamerTag.localeCompare(b.gamerTag);
		if (sortBy === 'matches') return b.rankedMatches - a.rankedMatches || b.rating - a.rating;
		if (sortBy === 'wins') return b.wins - a.wins || b.rating - a.rating;
		return b.rating - a.rating || a.gamerTag.localeCompare(b.gamerTag);
	});
	directory.replaceChildren();
	document.querySelector('#challenge-player-count').textContent = `Showing ${players.length} of ${directoryPlayers.length} player${directoryPlayers.length === 1 ? '' : 's'}`;
	if (!players.length) {
		const emptyState = makeMatchElement('div', 'player-directory-empty');
		emptyState.append(makeMatchElement('strong', '', directoryPlayers.length ? 'No players found' : 'No invite-ready profiles yet'));
		emptyState.append(makeMatchElement('p', '', directoryPlayers.length
			? 'Try a different search or filter, or reset the directory to see everyone.'
			: 'Players with a saved, valid email address appear here when their profile is ready.'));
		if (directoryPlayers.length) {
			const reset = makeMatchElement('button', 'directory-empty-reset', 'Reset filters');
			reset.type = 'button';
			reset.dataset.directoryAction = 'reset';
			emptyState.append(reset);
		}
		directory.append(emptyState);
		return;
	}
	players.forEach((player) => {
		const rating = playerRatingBand(player.rating);
		const total = player.wins + player.draws + player.losses;
		const winRate = total ? Math.round(player.wins / total * 100) : 0;
		const card = makeMatchElement('article', 'player-directory-card');
		const cardTop = makeMatchElement('div', 'player-card-topline');
		const avatar = makeMatchElement('span', `player-directory-avatar ${rating.className}`, player.gamerTag.slice(0, 1).toLocaleUpperCase());
		avatar.setAttribute('aria-hidden', 'true');
		const tier = makeMatchElement('span', `player-rating-tier ${rating.className}`, rating.label);
		cardTop.append(avatar, tier);
		const name = makeMatchElement('h4', 'player-directory-name', player.gamerTag);
		const ratingLine = makeMatchElement('p', 'player-directory-rating');
		ratingLine.append(makeMatchElement('strong', '', Number(player.rating).toLocaleString()), makeMatchElement('span', '', 'ELO rating'));
		const stats = makeMatchElement('dl', 'player-directory-stats');
		const statItems = [
			['Ranked record', `${player.wins}–${player.draws}–${player.losses}`],
			['Matches', String(player.rankedMatches)],
			['Win rate', total ? `${winRate}%` : '—']
		];
		statItems.forEach(([label, value]) => {
			const item = makeMatchElement('div');
			item.append(makeMatchElement('dt', '', label), makeMatchElement('dd', '', value));
			stats.append(item);
		});
		const experienceNote = makeMatchElement('p', 'player-experience-note', player.rankedMatches
			? `${player.rankedMatches} owner-approved ranked match${player.rankedMatches === 1 ? '' : 'es'}`
			: 'Ready to play a first ranked match');
		const challengeButton = makeMatchElement('button', 'challenge-primary-button player-challenge-button', 'Challenge player');
		challengeButton.type = 'button';
		challengeButton.dataset.challengePlayer = player.id;
		challengeButton.disabled = directoryPlayers.length < 2;
		if (challengeButton.disabled) challengeButton.title = 'A challenge needs two saved player profiles with linked email addresses.';
		challengeButton.append(makeMatchElement('span', 'player-challenge-arrow', '→'));
		card.append(cardTop, name, ratingLine, stats, experienceNote, challengeButton);
		directory.append(card);
	});
};

const addMatchAction = (parent, action, id, text, primary = false) => {
	const button = makeMatchElement('button', primary ? 'challenge-primary-button' : 'challenge-secondary-button', text);
	button.type = 'button';
	button.dataset.matchAction = action;
	button.dataset.matchId = id;
	parent.append(button);
};

const makeScoreForm = (match) => {
	const form = makeMatchElement('form', 'match-result-form');
	form.dataset.matchId = match.id;
	[
		['yourScore', 'Your score'],
		['opponentScore', 'Opponent score']
	].forEach(([name, text]) => {
		const label = makeMatchElement('label', '', text);
		const input = document.createElement('input');
		input.name = name;
		input.type = 'number';
		input.min = '0';
		input.max = '99';
		input.required = true;
		label.append(input);
		form.append(label);
	});
	const evidenceLabel = makeMatchElement('label', 'match-evidence-field', 'Scoreline screenshot (PNG, JPEG or WebP · max 5 MB)');
	const evidence = document.createElement('input');
	evidence.name = 'evidence';
	evidence.type = 'file';
	evidence.accept = 'image/png,image/jpeg,image/webp';
	evidence.required = true;
	evidenceLabel.append(evidence);
	const submit = makeMatchElement('button', 'challenge-secondary-button challenge-report-button', match.result ? 'Resubmit score & screenshot' : 'Submit score & screenshot');
	submit.type = 'submit';
	form.append(evidenceLabel, submit);
	return form;
};

const renderMatchCards = (matches) => {
	const list = document.querySelector('#my-matches-list');
	list.replaceChildren();
	if (!matches.length) {
		list.append(makeMatchElement('p', 'challenge-list-empty', 'Matches appear here when you open a private link sent to a selected player profile’s email. This keeps match details available without a sign-in or exposing email addresses.'));
		return;
	}
	matches.forEach((match) => {
		const other = match.isChallenger ? match.opponent : match.challenger;
		const card = makeMatchElement('article', 'challenge-match-card');
		const heading = makeMatchElement('div', 'challenge-match-heading');
		const title = makeMatchElement('div');
		title.append(
			makeMatchElement('strong', '', `${match.isChallenger ? 'You' : other.gamerTag} vs ${match.isChallenger ? other.gamerTag : 'you'}`),
			makeMatchElement('span', 'challenge-match-type', match.ranked ? 'Ranked · Elo' : 'Friendly')
		);
		heading.append(title, makeMatchElement('span', `challenge-match-status status-${match.status}`, challengeStatusText(match.status)));
		card.append(heading, makeMatchElement('p', 'challenge-match-time', `${formatChallengeTime(match.scheduledAt)} · your local time · reminder ${match.reminderMinutes >= 1440 ? '24 hours' : `${match.reminderMinutes} minutes`} before`));
		if (match.emailStatus?.[match.role] === 'failed' && match.status === 'pending') {
			card.append(makeMatchElement('p', 'challenge-warning', 'A match email could not be delivered. Check the server email settings before retrying.'));
		}
		if (match.status === 'rejected' && match.result?.reviewNote) {
			card.append(makeMatchElement('p', 'challenge-warning', `Owner review: ${match.result.reviewNote} Submit both scores and screenshots again for another review.`));
		}
		if (match.result?.approvedAt) {
			const ownScore = match.isChallenger ? match.result.challengerScore : match.result.opponentScore;
			const otherScore = match.isChallenger ? match.result.opponentScore : match.result.challengerScore;
			card.append(makeMatchElement('p', 'challenge-final-score', `Approved score: ${ownScore} – ${otherScore}`));
			const delta = match.isChallenger ? match.result.ratingChanges?.challenger : match.result.ratingChanges?.opponent;
			if (match.ranked && Number.isFinite(delta)) card.append(makeMatchElement('p', 'challenge-rating-change', `Owner-approved Elo change: ${delta > 0 ? '+' : ''}${delta}`));
		}
		const actions = makeMatchElement('div', 'challenge-match-actions');
		if (match.status === 'pending' && !match.isChallenger) {
			addMatchAction(actions, 'accept', match.id, 'Accept invitation', true);
			addMatchAction(actions, 'decline', match.id, 'Decline');
		} else if (match.status === 'pending' && match.isChallenger) {
			addMatchAction(actions, 'resend', match.id, 'Resend invitation email');
			addMatchAction(actions, 'cancel', match.id, 'Cancel invitation');
		} else if (match.status === 'awaiting-opponent' && match.result?.youReported) {
			card.append(makeMatchElement('p', 'challenge-awaiting-note', 'Your score and screenshot are saved. Waiting for the other player to submit their own report.'));
		} else if (['accepted', 'awaiting-opponent', 'disputed', 'rejected'].includes(match.status) && Date.now() >= Date.parse(match.scheduledAt)) {
			card.append(makeScoreForm(match));
		} else if (['awaiting-opponent', 'disputed', 'pending-owner'].includes(match.status)) {
			card.append(makeMatchElement('p', 'challenge-awaiting-note', 'Both players must report the same score with a screenshot. The owner then reviews the evidence.'));
		}
		if (actions.childElementCount) card.append(actions);
		list.append(card);
	});
};

const renderOwnerReviews = (matches) => {
	const list = document.querySelector('#owner-review-list');
	list.replaceChildren();
	if (!matches.length) {
		list.append(makeMatchElement('p', 'challenge-list-empty', 'No result reports are waiting for review.'));
		return;
	}
	matches.forEach((match) => {
		const card = makeMatchElement('article', 'owner-review-card');
		card.append(makeMatchElement('h5', '', `${match.challenger.gamerTag} vs ${match.opponent.gamerTag} · ${match.ranked ? 'Ranked' : 'Friendly'}`));
		card.append(makeMatchElement('p', 'challenge-match-time', `${challengeStatusText(match.status)} · ${formatChallengeTime(match.scheduledAt)}`));
		match.reports.forEach((report) => {
			const evidence = makeMatchElement('div', 'owner-evidence-card');
			evidence.append(makeMatchElement('p', '', `${report.player?.gamerTag || 'Player'} reports ${report.challengerScore} – ${report.opponentScore}`));
			if (report.evidenceAvailable && report.player) {
				const button = makeMatchElement('button', 'challenge-secondary-button', 'View submitted score screenshot');
				button.type = 'button';
				button.dataset.evidenceUrl = `/api/admin/matches/${encodeURIComponent(match.id)}/evidence/${encodeURIComponent(report.player.id)}`;
				evidence.append(button);
			}
			card.append(evidence);
		});
		const form = makeMatchElement('form', 'owner-decision-form');
		form.dataset.matchId = match.id;
		const scoreFields = makeMatchElement('div', 'owner-score-fields');
		[['challengerScore', 'Verified challenger score'], ['opponentScore', 'Verified opponent score']].forEach(([name, labelText]) => {
			const input = document.createElement('input');
			input.type = 'number';
			input.name = name;
			input.min = '0';
			input.max = '99';
			input.required = true;
			input.setAttribute('aria-label', labelText);
			if (match.reports.length) input.value = String(match.reports[0][name]);
			scoreFields.append(input);
		});
		scoreFields.append(makeMatchElement('span', '', '–'));
		const note = document.createElement('textarea');
		note.name = 'note';
		note.maxLength = 500;
		note.placeholder = 'Owner review note (required when rejecting)';
		const buttons = makeMatchElement('div', 'challenge-match-actions');
		[['approve', 'Approve result', true], ['reject', 'Reject result', false]].forEach(([value, text, primary]) => {
			const button = makeMatchElement('button', primary ? 'challenge-primary-button' : 'challenge-secondary-button', text);
			button.type = 'submit';
			button.value = value;
			buttons.append(button);
		});
		form.append(scoreFields, note, buttons);
		card.append(form);
		list.append(card);
	});
};

const loadChallengeData = async () => {
	const [health, playersResponse] = await Promise.all([matchApi('/api/health'), matchApi('/api/players')]);
	directoryPlayers = playersResponse.players;
	renderPlayerDirectory();
	document.querySelector('#directory-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
	const challengerSelect = document.querySelector('#challenge-challenger');
	const previousChallenger = challengerSelect.value || sessionStorage.getItem('timLeagueChallengerProfile') || '';
	challengerSelect.replaceChildren(new Option(directoryPlayers.length ? 'Choose your player profile' : 'No saved profiles available', ''));
	directoryPlayers.forEach((player) => challengerSelect.append(new Option(`${player.gamerTag} · ${player.rating} Elo`, player.id)));
	if (directoryPlayers.some((player) => player.id === previousChallenger)) challengerSelect.value = previousChallenger;
	challengerSelect.disabled = directoryPlayers.length < 2;
	const rankedInput = document.querySelector('#challenge-create-form [name="ranked"]');
	const rankedHelp = document.querySelector('#ranked-match-help');
	rankedInput.disabled = !health.ownerReviewConfigured;
	rankedHelp.textContent = health.ownerReviewConfigured
		? 'Owner review is enabled. Elo changes only after the submitted score is approved.'
		: 'Ranked challenges are unavailable until the owner configures private result review.';
	if (!health.emailDelivery) matchMessage(challengeStatusMessage, 'Email delivery is not configured. Private match links, invitations, and reminders cannot be delivered.', true);

	const links = readPrivateMatchLinks();
	const matchResults = await Promise.all(Object.entries(links).map(async ([id, link]) => {
		try {
			const result = await matchApi(`/api/matches/${encodeURIComponent(id)}`, { headers: { 'X-Match-Token': link.token } });
			return result.match;
		} catch (error) {
			if (error.status === 401 || error.status === 404) return null;
			throw error;
		}
	}));
	const validMatches = matchResults.filter(Boolean);
	renderMatchCards(validMatches);
	if (links && Object.keys(links).length && validMatches.length === 0) {
		matchMessage(challengeStatusMessage, 'Saved private match links have expired or were revoked. Open the newest match email link to continue.', true);
	}
	const ownerToken = sessionStorage.getItem(ownerAccessStorageKey);
	const ownerPanel = document.querySelector('#owner-review-panel');
	ownerPanel.hidden = !ownerToken || !health.ownerReviewConfigured;
	if (ownerToken && health.ownerReviewConfigured) {
		const reviews = await matchApi('/api/admin/matches');
		renderOwnerReviews(reviews.matches);
	}
};

const challengeForm = document.querySelector('#challenge-create-form');
if (challengeForm) {
	const dateInput = challengeForm.elements.scheduledAt;
	const challengeDialog = document.querySelector('#challenge-dialog');
	const challengerSelect = challengeForm.elements.challengerId;
	const opponentInput = challengeForm.elements.opponentId;
	const updateEarliestKickoff = () => {
		const earliestTime = new Date(Date.now() + 10 * 60 * 1000);
		earliestTime.setMinutes(Math.ceil(earliestTime.getMinutes() / 5) * 5, 0, 0);
		dateInput.min = new Date(earliestTime.getTime() - earliestTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
	};
	document.querySelectorAll('#player-search, #player-rating-filter, #player-experience-filter, #player-sort').forEach((control) => {
		control.addEventListener('input', renderPlayerDirectory);
		control.addEventListener('change', renderPlayerDirectory);
	});
	document.querySelector('#reset-player-filters').addEventListener('click', () => {
		document.querySelector('#player-search').value = '';
		document.querySelector('#player-rating-filter').value = 'all';
		document.querySelector('#player-experience-filter').value = 'all';
		document.querySelector('#player-sort').value = 'rating';
		renderPlayerDirectory();
		document.querySelector('#player-search').focus();
	});
	document.querySelectorAll('[data-directory-filter]').forEach((button) => {
		button.addEventListener('click', () => {
			document.querySelector('#player-search').value = '';
			document.querySelector('#player-rating-filter').value = button.dataset.directoryFilter === 'elite' ? 'elite' : 'all';
			document.querySelector('#player-experience-filter').value = ['played', 'new'].includes(button.dataset.directoryFilter) ? button.dataset.directoryFilter : 'all';
			if (button.dataset.directoryFilter === 'played') document.querySelector('#player-sort').value = 'matches';
			else if (button.dataset.directoryFilter === 'elite') document.querySelector('#player-sort').value = 'rating';
			else if (button.dataset.directoryFilter === 'new') document.querySelector('#player-sort').value = 'name';
			else document.querySelector('#player-sort').value = 'rating';
			renderPlayerDirectory();
		});
	});
	document.querySelector('#player-directory').addEventListener('click', (event) => {
		const reset = event.target.closest('[data-directory-action="reset"]');
		if (reset) {
			document.querySelector('#reset-player-filters').click();
			return;
		}
		const button = event.target.closest('[data-challenge-player]');
		if (!button) return;
		const player = directoryPlayers.find((item) => item.id === button.dataset.challengePlayer);
		if (!player) return;
		opponentInput.value = player.id;
		document.querySelector('#challenge-dialog-title').textContent = `Challenge ${player.gamerTag}`;
		document.querySelector('#challenge-dialog-player-summary').textContent = `${player.rating.toLocaleString()} Elo · ${player.rankedMatches} approved ranked matches · private invitation sent to the profile email`;
		[...challengerSelect.options].forEach((option) => {
			option.hidden = option.value === player.id;
			option.disabled = option.value === player.id;
		});
		if (challengerSelect.value === player.id) challengerSelect.value = '';
		updateEarliestKickoff();
		challengeDialog.showModal();
		challengerSelect.focus();
	});
	challengerSelect.addEventListener('change', () => {
		if (challengerSelect.value) sessionStorage.setItem('timLeagueChallengerProfile', challengerSelect.value);
	});
	document.querySelectorAll('[data-close-challenge]').forEach((button) => {
		button.addEventListener('click', () => challengeDialog.close());
	});
	challengeDialog.addEventListener('click', (event) => {
		if (event.target === challengeDialog) challengeDialog.close();
	});
	challengeForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (!challengerSelect.value || challengerSelect.value === opponentInput.value) {
			matchMessage(challengeStatusMessage, 'Choose your own player profile; it must be different from the opponent.', true);
			return;
		}
		const button = challengeForm.querySelector('button[type="submit"]');
		button.disabled = true;
		try {
			const date = new Date(dateInput.value);
			const result = await matchApi('/api/matches', { method: 'POST', body: JSON.stringify({
				challengerId: challengeForm.elements.challengerId.value,
				opponentId: challengeForm.elements.opponentId.value,
				scheduledAt: date.toISOString(),
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				reminderMinutes: Number(challengeForm.elements.reminderMinutes.value),
				ranked: challengeForm.elements.ranked.checked
			}) });
			challengeForm.reset();
			challengeDialog.close();
			matchMessage(challengeStatusMessage, result.message, !result.emailSent);
			await loadChallengeData();
		} catch (error) {
			matchMessage(challengeStatusMessage, error.message, true);
		} finally {
			button.disabled = false;
		}
	});
}

const incomingMatchLink = new URLSearchParams(window.location.hash.slice(1));
const incomingMatchId = incomingMatchLink.get('match');
const incomingMatchToken = incomingMatchLink.get('access');
const incomingOwnerToken = incomingMatchLink.get('owner');
if (incomingMatchId && incomingMatchToken) {
	const links = readPrivateMatchLinks();
	links[incomingMatchId] = { token: incomingMatchToken, addedAt: Date.now() };
	const orderedLinks = Object.entries(links).sort((a, b) => (b[1].addedAt || 0) - (a[1].addedAt || 0)).slice(0, 50);
	sessionStorage.setItem(matchAccessStorageKey, JSON.stringify(Object.fromEntries(orderedLinks)));
}
if (incomingOwnerToken) sessionStorage.setItem(ownerAccessStorageKey, incomingOwnerToken);
if (incomingMatchId || incomingOwnerToken) {
	window.history.replaceState({}, '', `${window.location.pathname}#challenges`);
}
const pendingVerificationToken = new URLSearchParams(window.location.search).get('verify');
if (pendingVerificationToken && challengeForm) {
	matchApi('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: pendingVerificationToken }) })
		.then(() => {
			window.history.replaceState({}, '', `${window.location.pathname}#challenges`);
			matchMessage(challengeStatusMessage, 'Email confirmed. This profile can now receive match challenges.');
			return loadChallengeData();
		})
		.catch((error) => matchMessage(challengeStatusMessage, error.message, true));
}
if (challengeForm) loadChallengeData().catch((error) => {
	document.querySelector('#challenge-player-count').textContent = 'Player records unavailable';
	document.querySelector('#player-directory').replaceChildren(
		makeMatchElement('div', 'player-directory-empty', error.message.includes('website server')
			? error.message
			: 'Could not load player records from the website server. Check that it is running, then refresh this page.')
	);
	matchMessage(challengeStatusMessage, error.message, true);
});

document.querySelector('#my-matches-list')?.addEventListener('click', async (event) => {
	const button = event.target.closest('[data-match-action]');
	if (!button) return;
	button.disabled = true;
	try {
		const action = button.dataset.matchAction;
		if (action === 'accept' || action === 'decline') {
			const response = await matchApi(`/api/matches/${encodeURIComponent(button.dataset.matchId)}/respond`, { method: 'POST', body: JSON.stringify({ action }) });
			matchMessage(challengeStatusMessage, `Invitation ${action === 'accept' ? 'accepted' : 'declined'}.${response.emailSent ? '' : ' Email notification could not be delivered.'}`, !response.emailSent);
		} else if (action === 'cancel') {
			await matchApi(`/api/matches/${encodeURIComponent(button.dataset.matchId)}/cancel`, { method: 'POST', body: '{}' });
			matchMessage(challengeStatusMessage, 'Invitation cancelled.');
		} else {
			await matchApi(`/api/matches/${encodeURIComponent(button.dataset.matchId)}/resend-invitation`, { method: 'POST', body: '{}' });
			matchMessage(challengeStatusMessage, 'Invitation email sent again.');
		}
		await loadChallengeData();
	} catch (error) {
		matchMessage(challengeStatusMessage, error.message, true);
		button.disabled = false;
	}
});

document.querySelector('#my-matches-list')?.addEventListener('submit', async (event) => {
	const form = event.target.closest('.match-result-form');
	if (!form) return;
	event.preventDefault();
	const button = form.querySelector('button[type="submit"]');
	const file = form.elements.evidence.files[0];
	if (!file || file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
		matchMessage(challengeStatusMessage, 'Choose a PNG, JPEG, or WebP screenshot smaller than 5 MB.', true);
		return;
	}
	button.disabled = true;
	try {
		const evidence = await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = () => reject(new Error('Could not read the screenshot file.'));
			reader.readAsDataURL(file);
		});
		const response = await matchApi(`/api/matches/${encodeURIComponent(form.dataset.matchId)}/result`, { method: 'POST', body: JSON.stringify({
			yourScore: Number(form.elements.yourScore.value),
			opponentScore: Number(form.elements.opponentScore.value),
			evidence
		}) });
		matchMessage(challengeStatusMessage, response.message);
		await loadChallengeData();
	} catch (error) {
		matchMessage(challengeStatusMessage, error.message, true);
		button.disabled = false;
	}
});

document.querySelector('#owner-review-list')?.addEventListener('click', async (event) => {
	const button = event.target.closest('[data-evidence-url]');
	if (!button) return;
	button.disabled = true;
	try {
		const response = await fetch(button.dataset.evidenceUrl, {
			headers: { 'X-Owner-Review-Token': sessionStorage.getItem(ownerAccessStorageKey) || '' }
		});
		if (!response.ok) throw new Error('The submitted screenshot could not be loaded.');
		const image = makeMatchElement('img', 'owner-evidence-image');
		image.alt = 'Submitted match scoreline screenshot';
		image.src = URL.createObjectURL(await response.blob());
		button.replaceWith(image);
	} catch (error) {
		matchMessage(challengeStatusMessage, error.message, true);
		button.disabled = false;
	}
});

document.querySelector('#owner-review-list')?.addEventListener('submit', async (event) => {
	const form = event.target.closest('.owner-decision-form');
	if (!form) return;
	event.preventDefault();
	const button = event.submitter;
	const decision = button?.value || 'approve';
	if (decision === 'reject' && form.elements.note.value.trim().length < 5) {
		matchMessage(challengeStatusMessage, 'Add an owner review note of at least five characters before rejecting.', true);
		return;
	}
	if (button) button.disabled = true;
	try {
		const response = await matchApi(`/api/admin/matches/${encodeURIComponent(form.dataset.matchId)}/decision`, { method: 'POST', body: JSON.stringify({
			decision,
			challengerScore: Number(form.elements.challengerScore.value),
			opponentScore: Number(form.elements.opponentScore.value),
			note: form.elements.note.value.trim(),
			reason: form.elements.note.value.trim()
		}) });
		const notification = response.emailsSent === false ? ' Player notification emails could not be delivered.' : ' Both players were notified by email.';
		matchMessage(challengeStatusMessage, decision === 'reject'
			? `Result rejected and the players were asked to submit fresh evidence.${notification}`
			: response.ranked
				? `Ranked result approved. Elo: challenger ${response.ratingChanges.challenger > 0 ? '+' : ''}${response.ratingChanges.challenger}, opponent ${response.ratingChanges.opponent > 0 ? '+' : ''}${response.ratingChanges.opponent}.${notification}`
				: `Friendly result approved. No ratings were changed.${notification}`);
		await loadChallengeData();
	} catch (error) {
		matchMessage(challengeStatusMessage, error.message, true);
		if (button) button.disabled = false;
	}
});

document.querySelector('#refresh-challenges')?.addEventListener('click', async (event) => {
	const button = event.currentTarget;
	button.disabled = true;
	button.textContent = 'Refreshing…';
	try {
		await loadChallengeData();
		matchMessage(challengeStatusMessage, 'Player profiles refreshed.');
	} catch (error) {
		matchMessage(challengeStatusMessage, error.message, true);
	} finally {
		button.disabled = false;
		button.textContent = 'Refresh players';
	}
});

/* ==========================================================================
   FEATURE: PRE-ENTRY LEAGUE AUTH GATEWAY & USER ACCESS CONTROL
   ========================================================================== */
const showLeagueAuthGate = () => {
	if (location.pathname.endsWith('/login.html') || 
	    location.pathname.endsWith('/signup.html') || 
	    location.pathname.endsWith('/admin.html') || 
	    location.pathname.endsWith('/verify-email.html') ||
	    location.pathname.endsWith('/reset-password.html')) {
		return;
	}

	let gate = document.getElementById('league-auth-gate');
	if (gate) {
		gate.hidden = false;
		document.body.classList.add('auth-gate-locked');
		return;
	}

	gate = document.createElement('div');
	gate.id = 'league-auth-gate';
	gate.className = 'league-auth-gate-overlay';
	gate.innerHTML = `
		<div class="league-auth-gate-card">
			<div class="gate-brand-header">
				<span class="gate-badge-pill">🏆 Tim eFootball League</span>
				<h2>Player Access Required</h2>
				<p>Sign in, register, or continue with Google to access your official player records, rankings, and tournament brackets.</p>
			</div>

			<div class="gate-tabs-nav">
				<button type="button" class="gate-tab-btn is-active" data-gate-tab="signin">Sign In</button>
				<button type="button" class="gate-tab-btn" data-gate-tab="signup">Sign Up</button>
				<button type="button" class="gate-tab-btn" data-gate-tab="google">Google</button>
			</div>

			<!-- TAB 1: SIGN IN -->
			<form id="gate-signin-form" class="gate-form-panel">
				<div class="gate-field-wrap">
					<label for="gate-signin-email">Gmail Address</label>
					<input type="email" id="gate-signin-email" placeholder="you@gmail.com" required autocomplete="email">
				</div>
				<div class="gate-field-wrap">
					<label for="gate-signin-password">Password</label>
					<div class="gate-pw-container">
						<input type="password" id="gate-signin-password" placeholder="••••••••" required autocomplete="current-password">
						<button type="button" class="gate-pw-toggle" data-pw-for="gate-signin-password" title="Show/Hide">👁️</button>
					</div>
				</div>
				<button type="submit" class="gate-submit-btn">Sign in to Club →</button>
			</form>

			<!-- TAB 2: SIGN UP -->
			<form id="gate-signup-form" class="gate-form-panel" hidden>
				<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
					<div class="gate-field-wrap">
						<label for="gate-signup-name">Full Name</label>
						<input type="text" id="gate-signup-name" placeholder="Ray Parker" required autocomplete="name">
					</div>
					<div class="gate-field-wrap">
						<label for="gate-signup-gamer">Gamer Tag</label>
						<input type="text" id="gate-signup-gamer" placeholder="RaysLegend" required autocomplete="nickname">
					</div>
				</div>
				<div class="gate-field-wrap">
					<label for="gate-signup-email">Gmail Address</label>
					<input type="email" id="gate-signup-email" placeholder="you@gmail.com" required autocomplete="email">
				</div>
				<div class="gate-field-wrap">
					<label for="gate-signup-password">Password</label>
					<div class="gate-pw-container">
						<input type="password" id="gate-signup-password" placeholder="8+ characters" minlength="6" required autocomplete="new-password">
						<button type="button" class="gate-pw-toggle" data-pw-for="gate-signup-password" title="Show/Hide">👁️</button>
					</div>
				</div>
				<button type="submit" class="gate-submit-btn">Create Account & Enter →</button>
			</form>

			<!-- TAB 3: CONTINUE WITH GOOGLE -->
			<div id="gate-google-panel" class="gate-form-panel gate-google-card" hidden>
				<p style="font-size: 0.85rem; color: #cbd5e1; margin: 0;">Connect your Google account for one-click entry to your personal profile & stats.</p>
				<button type="button" class="gate-google-btn" id="gate-google-action-btn">
					<svg class="gate-google-icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
					<span>Continue with Google</span>
				</button>
				<div class="gate-google-direct-wrap">
					<label style="display:block; font-size:0.75rem; color:#94a3b8; margin-bottom:6px; font-weight:700;">OR SIGN IN WITH YOUR GMAIL ADDRESS DIRECTLY:</label>
					<div style="display:flex; gap:8px;">
						<input type="email" id="gate-google-quick-email" placeholder="e.g. yourname@gmail.com" style="flex:1; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:9px 12px; color:#fff; font-size:0.85rem;">
						<button type="button" id="gate-google-quick-btn" class="gate-submit-btn" style="margin:0; width:auto; padding:9px 16px; font-size:0.8rem;">Enter</button>
					</div>
				</div>
			</div>

			<div class="gate-message-banner" id="gate-message-banner"></div>

			<div class="gate-footer-links">
				<span>League Season 04</span>
				<a href="admin.html">⚡ Admin Console →</a>
			</div>
		</div>
	`;

	document.body.appendChild(gate);
	document.body.classList.add('auth-gate-locked');

	const msgBanner = gate.querySelector('#gate-message-banner');
	const showGateMsg = (txt, isErr = false) => {
		if (!txt) {
			msgBanner.style.display = 'none';
			return;
		}
		msgBanner.textContent = txt;
		msgBanner.className = `gate-message-banner ${isErr ? 'error' : 'success'}`;
	};

	// Tab switching
	gate.querySelectorAll('.gate-tab-btn').forEach((btn) => {
		btn.addEventListener('click', () => {
			gate.querySelectorAll('.gate-tab-btn').forEach((b) => b.classList.remove('is-active'));
			btn.classList.add('is-active');
			const tab = btn.dataset.gateTab;
			gate.querySelector('#gate-signin-form').hidden = tab !== 'signin';
			gate.querySelector('#gate-signup-form').hidden = tab !== 'signup';
			gate.querySelector('#gate-google-panel').hidden = tab !== 'google';
			showGateMsg('');
		});
	});

	// Password toggle buttons
	gate.querySelectorAll('.gate-pw-toggle').forEach((btn) => {
		btn.addEventListener('click', () => {
			const target = document.getElementById(btn.dataset.pwFor);
			if (!target) return;
			if (target.type === 'password') {
				target.type = 'text';
				btn.textContent = '🙈';
			} else {
				target.type = 'password';
				btn.textContent = '👁️';
			}
		});
	});

	// Handle Sign In
	gate.querySelector('#gate-signin-form').addEventListener('submit', async (e) => {
		e.preventDefault();
		const email = gate.querySelector('#gate-signin-email').value.trim();
		const password = gate.querySelector('#gate-signin-password').value;
		const submitBtn = e.target.querySelector('button[type="submit"]');
		submitBtn.disabled = true;
		submitBtn.textContent = 'Signing in…';
		showGateMsg('');

		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ email, password })
			});
			const data = await res.json().catch(() => ({}));
			if (res.status === 403) {
				showGateMsg(data.message || '⚠️ Please verify your Gmail address before signing in. Check your inbox.', true);
				return;
			}
			if (!res.ok) throw new Error(data.message || 'Sign in failed.');
			showGateMsg('✓ Signed in! Unlocking league…', false);
			setTimeout(() => {
				hideLeagueAuthGate();
				setupUserSession();
			}, 300);
		} catch (err) {
			showGateMsg(err.message, true);
		} finally {
			submitBtn.disabled = false;
			submitBtn.textContent = 'Sign in to Club →';
		}
	});

	// Handle Sign Up
	gate.querySelector('#gate-signup-form').addEventListener('submit', async (e) => {
		e.preventDefault();
		const firstName = gate.querySelector('#gate-signup-name').value.trim();
		const gamerTag = gate.querySelector('#gate-signup-gamer').value.trim();
		const email = gate.querySelector('#gate-signup-email').value.trim();
		const password = gate.querySelector('#gate-signup-password').value;
		const submitBtn = e.target.querySelector('button[type="submit"]');
		submitBtn.disabled = true;
		submitBtn.textContent = 'Creating profile…';
		showGateMsg('');

		try {
			const res = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ firstName, gamerTag, email, password })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.message || 'Account registration failed.');

			if (data.requiresVerification || !data.verified) {
				showGateMsg(`📧 Verification email sent to ${email}! Please check your Gmail and click the link to activate your account, then sign in.`, false);
				// Pre-fill email in signin form and switch tab after a brief moment
				const signinEmailInput = gate.querySelector('#gate-signin-email');
				if (signinEmailInput) signinEmailInput.value = email;
				setTimeout(() => {
					gate.querySelector('[data-gate-tab="signin"]')?.click();
				}, 3500);
				return;
			}

			showGateMsg('✓ Account created! Welcome, ' + (gamerTag || firstName) + '!', false);
			setTimeout(() => {
				hideLeagueAuthGate();
				setupUserSession();
			}, 400);
		} catch (err) {
			showGateMsg(err.message, true);
		} finally {
			submitBtn.disabled = false;
			submitBtn.textContent = 'Create Account & Enter →';
		}
	});

	// Handle Google Sign In
	const handleGoogleAuth = async (emailParam) => {
		showGateMsg('Connecting with Google…', false);
		try {
			const res = await fetch('/api/auth/google', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ email: emailParam })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.message || 'Google sign-in failed.');
			showGateMsg('✓ Signed in with Google! Unlocking…', false);
			setTimeout(() => {
				hideLeagueAuthGate();
				setupUserSession();
			}, 300);
		} catch (err) {
			showGateMsg(err.message, true);
		}
	};

	gate.querySelector('#gate-google-action-btn')?.addEventListener('click', () => {
		const quickEmail = gate.querySelector('#gate-google-quick-email')?.value.trim();
		if (quickEmail) {
			handleGoogleAuth(quickEmail);
		} else {
			const entered = prompt('Enter your Gmail address to continue with Google:', '');
			if (entered && entered.trim()) {
				handleGoogleAuth(entered.trim());
			}
		}
	});

	gate.querySelector('#gate-google-quick-btn')?.addEventListener('click', () => {
		const quickEmail = gate.querySelector('#gate-google-quick-email')?.value.trim();
		if (!quickEmail) {
			showGateMsg('Please enter your Gmail address.', true);
			return;
		}
		handleGoogleAuth(quickEmail);
	});
};

const hideLeagueAuthGate = () => {
	const gate = document.getElementById('league-auth-gate');
	if (gate) {
		gate.remove();
	}
	document.body.classList.remove('auth-gate-locked');
};

const setupUserSession = async () => {
	if (location.pathname.endsWith('/login.html') || 
	    location.pathname.endsWith('/signup.html') ||
	    location.pathname.endsWith('/admin.html')) return;

	try {
		const response = await fetch('/api/me', { credentials: 'same-origin' });
		if (response.status === 401 || !response.ok) {
			showLeagueAuthGate();
			return;
		}
		const session = await response.json().catch(() => ({}));
		if (!session.authenticated) {
			showLeagueAuthGate();
			return;
		}

		hideLeagueAuthGate();

		// 1. Update .header-actions with a premium user pill & sign-out button
		const headerActions = document.querySelector('.header-actions');
		if (headerActions) {
			const displayName = session.gamerTag || session.gamerName || session.name || 'Player';
			const initial = displayName.charAt(0).toUpperCase();
			const rating = Number(session.rating) || 1200;

			headerActions.innerHTML = `
				<div class="header-user">
					<a href="profile.html" class="header-user-badge" title="View your profile (${displayName})">
						<span class="header-user-avatar">${initial}</span>
						<span class="header-user-info">
							<strong class="header-user-name">${displayName}</strong>
							<small class="header-user-rating">${rating.toLocaleString()} Elo</small>
						</span>
					</a>
					<button type="button" class="header-logout-btn" title="Sign out" aria-label="Sign out">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
					</button>
				</div>
			`;

			headerActions.querySelector('.header-logout-btn')?.addEventListener('click', async () => {
				try {
					await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
				} finally {
					location.reload();
				}
			});
		}

		// 2. Update mobile nav auth items if present
		const mobileAuthItems = document.querySelectorAll('.nav-auth-item');
		if (mobileAuthItems.length >= 2) {
			const displayName = session.gamerTag || session.gamerName || session.name || 'Player';
			mobileAuthItems[0].innerHTML = `<a href="profile.html" class="nav-auth-link">My Profile (${displayName})</a>`;
			mobileAuthItems[1].innerHTML = `<a href="#" class="nav-auth-link" id="mobile-logout-link">Sign out</a>`;
			mobileAuthItems[1].querySelector('#mobile-logout-link')?.addEventListener('click', async (e) => {
				e.preventDefault();
				try {
					await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
				} finally {
					location.reload();
				}
			});
		}

		// 3. Personalize home page team badge & dashboard if present
		const teamName = document.querySelector('#team-name');
		const teamInitial = document.querySelector('#team-initial');
		if (teamName) teamName.textContent = session.gamerTag || session.gamerName || session.name;
		if (teamInitial) teamInitial.textContent = (session.gamerTag || session.gamerName || session.name || 'T').charAt(0).toUpperCase();

		const dashStatMatches = document.querySelector('#dash-stat-matches');
		const dashStatRecord = document.querySelector('#dash-stat-record');
		const dashStatWinrate = document.querySelector('#dash-stat-winrate');
		const dashStatStreak = document.querySelector('#dash-stat-streak');
		const dashUserRating = document.querySelector('#dash-user-rating');
		const dashUserTier = document.querySelector('#dash-user-tier');
		const dashUserBar = document.querySelector('#dash-user-bar');

		const totalMatches = (Number(session.wins) || 0) + (Number(session.draws) || 0) + (Number(session.losses) || 0);
		const winRate = totalMatches ? Math.round(((Number(session.wins) || 0) / totalMatches) * 100) : 0;
		const rating = Number(session.rating) || 1200;

		if (dashStatMatches) dashStatMatches.textContent = String(totalMatches);
		if (dashStatRecord) dashStatRecord.textContent = `${session.wins || 0}W - ${session.draws || 0}D - ${session.losses || 0}L`;
		if (dashStatWinrate) dashStatWinrate.textContent = `${winRate}%`;
		if (dashStatStreak) dashStatStreak.textContent = (session.wins || 0) > 0 ? `${session.wins}W streak` : 'Active';
		if (dashUserRating) dashUserRating.textContent = `${rating.toLocaleString()} Elo`;
		const tierName = rating >= 1400 ? 'Premier Division' : rating >= 1100 ? 'Challenger Division' : 'Academy Division';
		const tierPercent = Math.min(100, Math.max(10, Math.round(((rating - 500) / 1500) * 100)));
		if (dashUserTier) dashUserTier.textContent = tierName;
		if (dashUserBar) dashUserBar.style.width = `${tierPercent}%`;

		// 4. Personalize match-account-gate on matches.html
		const gateIntro = document.querySelector('#match-account-gate .account-gate-intro');
		if (gateIntro) {
			const displayName = session.gamerTag || session.gamerName || session.name || 'Player';
			const h3 = gateIntro.querySelector('h3');
			const p = gateIntro.querySelector('p');
			if (h3) h3.textContent = `Welcome back, ${displayName}`;
			if (p) p.textContent = `Signed in with ${session.email || 'verified account'}. Your rating: ${session.rating || 1200} Elo (${session.wins || 0}W - ${session.draws || 0}D - ${session.losses || 0}L).`;
		}

		// 5. Pre-fill Elo calculator on rankings.html
		const userEloInput = document.querySelector('#calc-user-rating');
		if (userEloInput && !userEloInput.dataset.manual) {
			userEloInput.value = session.rating || 1200;
			userEloInput.dispatchEvent(new Event('input'));
		}

		// 6. Admin navigation link & floating access pill
		if (session.isAdmin || session.isOwner) {
			const navList = document.querySelector('.nav-list');
			if (navList && !navList.querySelector('.nav-admin-item')) {
				const adminLi = document.createElement('li');
				adminLi.className = 'nav-item nav-admin-item';
				adminLi.innerHTML = '<a href="admin.html" class="nav-link nav-admin-link">⚡ Admin</a>';
				navList.append(adminLi);
			}

			const mobileNavAuth = document.querySelector('.nav-drawer, .nav-menu, .site-nav-mobile');
			if (mobileNavAuth && !mobileNavAuth.querySelector('.nav-admin-pill')) {
				const mobileAdminLi = document.createElement('li');
				mobileAdminLi.className = 'nav-auth-item nav-admin-item';
				mobileAdminLi.innerHTML = '<a href="admin.html" class="nav-auth-link nav-admin-pill">⚡ Admin Console</a>';
				mobileNavAuth.querySelector('ul')?.prepend(mobileAdminLi);
			}

			if (!document.getElementById('admin-floating-pill')) {
				const floatingPill = document.createElement('a');
				floatingPill.id = 'admin-floating-pill';
				floatingPill.className = 'admin-floating-pill';
				floatingPill.href = 'admin.html';
				floatingPill.title = 'Open Master Admin Operations Console';
				floatingPill.innerHTML = '<span class="floating-pill-icon">⚡</span><span class="floating-pill-text">Admin Mode</span>';
				document.body.appendChild(floatingPill);
			}
		}
	} catch (error) {
		console.warn('Could not initialize session state:', error);
	}
};

setupUserSession();

// Sitewide Live Announcement Banner
const setupSiteAnnouncement = async () => {
	if (location.pathname.endsWith('/admin.html')) return;

	try {
		const res = await fetch('/api/site/announcement');
		if (!res.ok) return;
		const data = await res.json();
		const ann = data?.announcement || data;
		if (!ann || !ann.active || !ann.text) return;

		const dismissedKey = 'tim_dismissed_announcement';
		if (sessionStorage.getItem(dismissedKey) === ann.text) return;

		const bar = document.createElement('div');
		bar.className = `site-announcement-bar announcement-${ann.type || 'gold'}`;
		bar.setAttribute('role', 'region');
		bar.setAttribute('aria-label', 'Sitewide announcement');

		const linkHtml = (ann.linkText && ann.linkUrl)
			? `<a href="${ann.linkUrl}" class="announcement-link">${ann.linkText}</a>`
			: '';

		bar.innerHTML = `
			<div class="announcement-content">
				<span class="announcement-badge">${ann.badge || 'LEAGUE NOTICE'}</span>
				<span class="announcement-text">${ann.text}</span>
				${linkHtml}
			</div>
			<button type="button" class="announcement-close" aria-label="Dismiss announcement">&times;</button>
		`;

		bar.querySelector('.announcement-close')?.addEventListener('click', () => {
			sessionStorage.setItem(dismissedKey, ann.text);
			bar.classList.add('is-dismissing');
			setTimeout(() => bar.remove(), 250);
		});

		document.body.prepend(bar);
	} catch (e) {
		// Public announcement is non-critical
	}
};

setupSiteAnnouncement();

/* ==========================================================================
   FEATURE 1: HEAD-TO-HEAD (H2H) MATCH PREDICTOR
   ========================================================================== */
const initH2HPredictor = () => {
	const container = document.querySelector('#h2h-predictor');
	if (!container) return;

	const selectA = container.querySelector('#h2h-select-a');
	const selectB = container.querySelector('#h2h-select-b');
	const swapBtn = container.querySelector('#h2h-swap-btn');
	const simBtn = container.querySelector('#simulate-match-btn');
	const simResult = container.querySelector('#simulation-result');

	const competitors = [
		{ id: 'novablade', name: 'NovaBlade', sub: 'Nova FC · Captain', elo: 1864, avatar: 'NB', color: 'gold', attack: 92, defense: 88, form: 96, matches: 28 },
		{ id: 'rexorion', name: 'Rex Orion', sub: 'Orbit XI · Captain', elo: 1842, avatar: 'RO', color: 'blue', attack: 89, defense: 90, form: 88, matches: 27 },
		{ id: 'bluestrike', name: 'BlueStrike', sub: 'Falcon City', elo: 1805, avatar: 'BS', color: 'teal', attack: 91, defense: 82, form: 92, matches: 26 },
		{ id: 'tim', name: 'Tim', sub: 'Tim United · Founder', elo: 1784, avatar: 'T', color: 'gold', attack: 87, defense: 86, form: 85, matches: 25 },
		{ id: 'acephantom', name: 'Ace Phantom', sub: 'Atlas United', elo: 1761, avatar: 'AP', color: 'red', attack: 85, defense: 84, form: 80, matches: 25 },
		{ id: 'kingkai', name: 'King Kai', sub: 'Rovers FC', elo: 1698, avatar: 'KK', color: 'orange', attack: 83, defense: 81, form: 84, matches: 25 },
		{ id: 'madridista', name: 'Madridista', sub: 'Delta FC', elo: 1644, avatar: 'M', color: 'pink', attack: 80, defense: 79, form: 78, matches: 24 },
		{ id: 'pixelpilot', name: 'PixelPilot', sub: 'Academy United', elo: 1487, avatar: 'PP', color: 'lime', attack: 74, defense: 72, form: 75, matches: 22 },
		{ id: 'novafc', name: 'Nova FC (Club)', sub: 'Premier Division', elo: 1986, avatar: 'NF', color: 'violet', attack: 95, defense: 92, form: 95, matches: 28 },
		{ id: 'orbitxi', name: 'Orbit XI (Club)', sub: 'Premier Division', elo: 1942, avatar: 'OX', color: 'blue', attack: 92, defense: 93, form: 91, matches: 26 },
		{ id: 'falconcity', name: 'Falcon City (Club)', sub: 'Premier Division', elo: 1901, avatar: 'FC', color: 'teal', attack: 90, defense: 88, form: 89, matches: 24 }
	];

	const populateSelects = () => {
		selectA.innerHTML = '';
		selectB.innerHTML = '';
		competitors.forEach((c) => {
			const optA = new Option(`${c.name} (${c.elo} Elo)`, c.id);
			const optB = new Option(`${c.name} (${c.elo} Elo)`, c.id);
			selectA.add(optA);
			selectB.add(optB);
		});
		selectA.value = 'novablade';
		selectB.value = 'rexorion';
	};

	populateSelects();

	const updatePrediction = () => {
		const compA = competitors.find((c) => c.id === selectA.value) || competitors[0];
		const compB = competitors.find((c) => c.id === selectB.value) || competitors[1];

		// Profile card A
		container.querySelector('#h2h-avatar-a').textContent = compA.avatar;
		container.querySelector('#h2h-name-a').textContent = compA.name;
		container.querySelector('#h2h-elo-a').textContent = `${compA.elo.toLocaleString()} Elo · ${compA.sub}`;

		// Profile card B
		container.querySelector('#h2h-avatar-b').textContent = compB.avatar;
		container.querySelector('#h2h-name-b').textContent = compB.name;
		container.querySelector('#h2h-elo-b').textContent = `${compB.elo.toLocaleString()} Elo · ${compB.sub}`;

		// Elo probabilities (Home advantage +25 Elo)
		const homeBonus = 25;
		const eloDiff = (compA.elo + homeBonus) - compB.elo;
		const winProbA = 1 / (1 + Math.pow(10, -eloDiff / 400));
		const drawProb = Math.max(0.16, Math.min(0.28, 0.28 - Math.abs(compA.elo - compB.elo) / 2500));
		const rawHome = (1 - drawProb) * winProbA;
		const rawAway = (1 - drawProb) * (1 - winProbA);

		const pctA = Math.round(rawHome * 100);
		const pctDraw = Math.round(drawProb * 100);
		const pctB = Math.max(1, 100 - pctA - pctDraw);

		container.querySelector('#h2h-prob-label-a').textContent = `${compA.name} ${pctA}%`;
		container.querySelector('#h2h-prob-label-draw').textContent = `Draw ${pctDraw}%`;
		container.querySelector('#h2h-prob-label-b').textContent = `${compB.name} ${pctB}%`;

		container.querySelector('#h2h-fill-a').style.width = `${pctA}%`;
		container.querySelector('#h2h-fill-draw').style.width = `${pctDraw}%`;
		container.querySelector('#h2h-fill-b').style.width = `${pctB}%`;

		// Metrics
		const updateDualMetric = (valA, valB, elValA, elValB, elBarA, elBarB) => {
			const total = valA + valB || 1;
			const pA = Math.round((valA / total) * 100);
			const pB = 100 - pA;
			container.querySelector(elValA).textContent = valA;
			container.querySelector(elValB).textContent = valB;
			container.querySelector(elBarA).style.width = `${pA}%`;
			container.querySelector(elBarB).style.width = `${pB}%`;
		};

		updateDualMetric(compA.attack, compB.attack, '#metric-att-a', '#metric-att-b', '#bar-att-a', '#bar-att-b');
		updateDualMetric(compA.defense, compB.defense, '#metric-def-a', '#metric-def-b', '#bar-def-a', '#bar-def-b');
		updateDualMetric(compA.form, compB.form, '#metric-form-a', '#metric-form-b', '#bar-form-a', '#bar-form-b');
		updateDualMetric(compA.matches, compB.matches, '#metric-exp-a', '#metric-exp-b', '#bar-exp-a', '#bar-exp-b');

		if (simResult) simResult.hidden = true;
	};

	selectA.addEventListener('change', updatePrediction);
	selectB.addEventListener('change', updatePrediction);
	swapBtn?.addEventListener('click', () => {
		const temp = selectA.value;
		selectA.value = selectB.value;
		selectB.value = temp;
		updatePrediction();
	});

	simBtn?.addEventListener('click', () => {
		const compA = competitors.find((c) => c.id === selectA.value) || competitors[0];
		const compB = competitors.find((c) => c.id === selectB.value) || competitors[1];

		simBtn.disabled = true;
		simBtn.textContent = 'Simulating match tactical engine…';

		setTimeout(() => {
			simBtn.disabled = false;
			simBtn.innerHTML = '<span class="sim-icon">⚡</span> Re-Run Simulation';
			simResult.hidden = false;

			// Poisson-like simulated scoreline based on rating
			const homeDiff = (compA.elo + 25) - compB.elo;
			let goalsA = Math.max(0, Math.floor(Math.random() * 2.6 + (homeDiff > 0 ? 0.8 : 0.2)));
			let goalsB = Math.max(0, Math.floor(Math.random() * 2.3 + (homeDiff < 0 ? 0.8 : 0.1)));

			// Add probability weighting
			if (homeDiff > 200 && goalsA <= goalsB && Math.random() < 0.6) goalsA = goalsB + 1;
			if (homeDiff < -200 && goalsB <= goalsA && Math.random() < 0.6) goalsB = goalsA + 1;

			container.querySelector('#sim-team-a').textContent = compA.name;
			container.querySelector('#sim-team-b').textContent = compB.name;
			container.querySelector('#sim-score-a').textContent = goalsA;
			container.querySelector('#sim-score-b').textContent = goalsB;

			// Commentary highlights
			const timeline = container.querySelector('#sim-timeline');
			timeline.innerHTML = '';

			const events = [
				{ min: "14'", text: `High pressing from ${compA.name} triggers a turnover in the final third. Low cross cut back.` },
				{ min: "28'", text: `${compB.name} breaks on a lightning counter-attack; goalkeeper produces an acrobatic save.` },
				{ min: "52'", text: `Tactical adjustment: Midfield block tightened; tempo shifts into possession dominance.` },
				{ min: "74'", text: `Crucial aerial duel won inside the penalty box following a whipped set-piece.` },
				{ min: "89'", text: `Late goal-line clearance seals the tactical duel as full-time whistles blow!` }
			];

			if (goalsA > 0) events.splice(1, 0, { min: "22'", goal: true, text: `⚽ GOAL! ${compA.name} strikes with precision into the bottom corner!` });
			if (goalsB > 0) events.splice(3, 0, { min: "63'", goal: true, text: `⚽ GOAL! ${compB.name} levels the contest with a sensational half-volley!` });
			if (goalsA > 1) events.push({ min: "81'", goal: true, text: `⚽ GOAL! Decisive breakthrough finish by ${compA.name}!` });

			events.sort((x, y) => parseInt(x.min) - parseInt(y.min));

			events.forEach((ev) => {
				const item = document.createElement('div');
				item.className = `sim-event${ev.goal ? ' is-goal' : ''}`;
				item.innerHTML = `<span class="sim-min">${ev.min}</span><span class="sim-desc">${ev.text}</span>`;
				timeline.append(item);
			});
		}, 600);
	});

	updatePrediction();
};

/* ==========================================================================
   FEATURE 2: INTERACTIVE ELO CALCULATOR & TIER SIMULATOR
   ========================================================================== */
const initEloCalculator = () => {
	const container = document.querySelector('#elo-calculator');
	if (!container) return;

	const userRatingInput = container.querySelector('#calc-user-rating');
	const oppRatingInput = container.querySelector('#calc-opponent-rating');
	const kFactorSelect = container.querySelector('#calc-k-factor');
	const presetSelect = container.querySelector('#calc-opponent-preset');
	const outcomeButtons = container.querySelectorAll('.calc-res-btn');
	let currentOutcome = 'win';

	const presets = [
		{ name: 'NovaBlade (Season #1)', elo: 1864 },
		{ name: 'Rex Orion (Season #2)', elo: 1842 },
		{ name: 'BlueStrike (Season #3)', elo: 1805 },
		{ name: 'Tim (League Founder)', elo: 1784 },
		{ name: 'Ace Phantom', elo: 1761 },
		{ name: 'King Kai', elo: 1698 },
		{ name: 'Madridista', elo: 1644 },
		{ name: 'PixelPilot', elo: 1487 },
		{ name: 'Developing Contender', elo: 1050 }
	];

	if (presetSelect) {
		presets.forEach((p) => {
			presetSelect.add(new Option(`${p.name} · ${p.elo} Elo`, p.elo));
		});
		presetSelect.addEventListener('change', () => {
			if (presetSelect.value) {
				oppRatingInput.value = presetSelect.value;
				calculateElo();
			}
		});
	}

	const calculateElo = () => {
		const rA = Number(userRatingInput.value) || 1200;
		const rB = Number(oppRatingInput.value) || 1200;
		const K = Number(kFactorSelect.value) || 32;

		const score = currentOutcome === 'win' ? 1.0 : currentOutcome === 'draw' ? 0.5 : 0.0;
		const expectedScore = 1 / (1 + Math.pow(10, (rB - rA) / 400));
		const delta = Math.round(K * (score - expectedScore));
		const projected = Math.max(100, rA + delta);

		const deltaEl = container.querySelector('#calc-delta');
		deltaEl.textContent = `${delta > 0 ? '+' : ''}${delta}`;
		deltaEl.className = `calc-delta-val ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'}`;

		container.querySelector('#calc-projected-rating').textContent = `Projected: ${projected.toLocaleString()} Elo (${delta > 0 ? '+' : ''}${delta})`;

		// Tier calculation
		let tierName = 'Developing Tier';
		let tierClass = 'tier-developing';
		let nextMilestone = 1100;
		let nextTierName = 'Competitive (1,100+)';

		if (projected >= 1750) {
			tierName = 'Premier Tier';
			tierClass = 'tier-premier';
			nextMilestone = 2000;
			nextTierName = 'Top 10 Grandmaster (2,000+)';
		} else if (projected >= 1400) {
			tierName = 'Elite Tier';
			tierClass = 'tier-elite';
			nextMilestone = 1750;
			nextTierName = 'Premier Tier (1,750+)';
		} else if (projected >= 1100) {
			tierName = 'Competitive Tier';
			tierClass = 'tier-competitive';
			nextMilestone = 1400;
			nextTierName = 'Elite Tier (1,400+)';
		}

		const tierBadge = container.querySelector('#calc-tier-badge');
		tierBadge.textContent = tierName;
		tierBadge.className = `calc-tier-badge ${tierClass}`;

		const pointsToNext = Math.max(0, nextMilestone - projected);
		container.querySelector('#calc-tier-next').textContent = pointsToNext > 0
			? `${pointsToNext} pts to ${nextTierName}`
			: 'Tier Cap Achieved!';

		// Meter progress (range 500 to 2000)
		const meterPercent = Math.min(100, Math.max(5, Math.round(((projected - 500) / 1500) * 100)));
		container.querySelector('#calc-tier-meter-fill').style.width = `${meterPercent}%`;

		// Insight narrative
		const diff = rA - rB;
		let insight = '';
		if (currentOutcome === 'win') {
			if (diff < -100) {
				insight = `Underdog triumph! Defeating a rival rated ${Math.abs(diff)} points higher produces a huge +${delta} Elo swing, supercharging your ranking ladder progress.`;
			} else if (diff > 100) {
				insight = `Expected victory. Overcoming an opponent rated ${diff} points lower secures a modest +${delta} Elo gain while safeguarding your ranking status.`;
			} else {
				insight = `Evenly matched contest. Overcoming your direct equal awards a solid +${delta} Elo gain to pull ahead in the standings.`;
			}
		} else if (currentOutcome === 'draw') {
			insight = diff < 0
				? `Stalemate against higher-rated rival earns +${delta} Elo for outperforming statistical expectations.`
				: `Drawing against lower-rated opposition yields a slight ${delta} Elo deduction.`;
		} else {
			insight = diff > 100
				? `Upset loss! Falling to a challenger rated ${diff} points lower costs ${delta} Elo. Regroup and bounce back next fixture.`
				: `A hard-fought loss against superior or equal opposition results in a controlled ${delta} Elo change.`;
		}
		container.querySelector('#calc-insight-text').textContent = insight;
	};

	outcomeButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			outcomeButtons.forEach((b) => {
				b.classList.remove('is-active');
				b.setAttribute('aria-pressed', 'false');
			});
			btn.classList.add('is-active');
			btn.setAttribute('aria-pressed', 'true');
			currentOutcome = btn.dataset.outcome;
			calculateElo();
		});
	});

	userRatingInput.addEventListener('input', () => {
		userRatingInput.dataset.manual = 'true';
		calculateElo();
	});
	oppRatingInput.addEventListener('input', () => {
		if (presetSelect) presetSelect.value = '';
		calculateElo();
	});
	kFactorSelect.addEventListener('change', calculateElo);

	calculateElo();
};

/* ==========================================================================
   FEATURE 3: OFFICIAL LEAGUE CUP KNOCKOUT BRACKET (ADMIN LIVE ADVANCEMENT)
   ========================================================================== */
const initCupBracket = async () => {
	const container = document.querySelector('#cup-interactive-bracket');
	if (!container) return;

	let r1 = [];
	let qf = [];
	let sf = [];
	let finalMatch = { p1: 'TBD', p2: 'TBD', winner: null };
	let champion = null;

	const renderBracket = () => {
		const r1Container = container.querySelector('#bracket-r1');
		if (r1Container && r1.length > 0) {
			r1Container.innerHTML = r1.map((m, idx) => `
				<div class="bracket-match-card" data-match-round="r1" data-match-idx="${idx}">
					<div class="bracket-team-btn ${m.winner === m.p1 ? 'is-winner' : ''}">
						<span>${m.p1}</span>
						<strong class="bracket-team-status">${m.winner === m.p1 ? '✓ ADVANCED' : ''}</strong>
					</div>
					<div class="bracket-team-btn ${m.winner === m.p2 ? 'is-winner' : ''}">
						<span>${m.p2}</span>
						<strong class="bracket-team-status">${m.winner === m.p2 ? '✓ ADVANCED' : ''}</strong>
					</div>
				</div>
			`).join('');
		}

		const qfContainer = container.querySelector('#bracket-qf');
		if (qfContainer && qf.length > 0) {
			qfContainer.innerHTML = qf.map((m, idx) => `
				<div class="bracket-match-card" data-match-round="qf" data-match-idx="${idx}">
					<div class="bracket-team-btn ${m.winner === m.p1 && m.p1 !== 'TBD' ? 'is-winner' : ''}">
						<span>${m.p1 || 'TBD'}</span>
						<strong class="bracket-team-status">${m.winner === m.p1 && m.p1 !== 'TBD' ? '✓ ADVANCED' : ''}</strong>
					</div>
					<div class="bracket-team-btn ${m.winner === m.p2 && m.p2 !== 'TBD' ? 'is-winner' : ''}">
						<span>${m.p2 || 'TBD'}</span>
						<strong class="bracket-team-status">${m.winner === m.p2 && m.p2 !== 'TBD' ? '✓ ADVANCED' : ''}</strong>
					</div>
				</div>
			`).join('');
		}

		const sfContainer = container.querySelector('#bracket-sf');
		if (sfContainer && sf.length > 0) {
			sfContainer.innerHTML = sf.map((m, idx) => `
				<div class="bracket-match-card" data-match-round="sf" data-match-idx="${idx}">
					<div class="bracket-team-btn ${m.winner === m.p1 && m.p1 !== 'TBD' ? 'is-winner' : ''}">
						<span>${m.p1 || 'TBD'}</span>
						<strong class="bracket-team-status">${m.winner === m.p1 && m.p1 !== 'TBD' ? '✓ ADVANCED' : ''}</strong>
					</div>
					<div class="bracket-team-btn ${m.winner === m.p2 && m.p2 !== 'TBD' ? 'is-winner' : ''}">
						<span>${m.p2 || 'TBD'}</span>
						<strong class="bracket-team-status">${m.winner === m.p2 && m.p2 !== 'TBD' ? '✓ ADVANCED' : ''}</strong>
					</div>
				</div>
			`).join('');
		}

		const finalContainer = container.querySelector('#bracket-final');
		if (finalContainer) {
			finalContainer.innerHTML = `
				<div class="bracket-match-card is-final">
					<span class="final-trophy-badge">🏆 CHAMPIONSHIP MATCH</span>
					<div class="bracket-team-btn ${finalMatch.winner === finalMatch.p1 && finalMatch.p1 !== 'TBD' ? 'is-winner' : ''}">
						<span>${finalMatch.p1 || 'TBD'}</span>
						<strong class="bracket-team-status">${finalMatch.winner === finalMatch.p1 && finalMatch.p1 !== 'TBD' ? '🏆 CHAMPION' : ''}</strong>
					</div>
					<div class="bracket-team-btn ${finalMatch.winner === finalMatch.p2 && finalMatch.p2 !== 'TBD' ? 'is-winner' : ''}">
						<span>${finalMatch.p2 || 'TBD'}</span>
						<strong class="bracket-team-status">${finalMatch.winner === finalMatch.p2 && finalMatch.p2 !== 'TBD' ? '🏆 CHAMPION' : ''}</strong>
					</div>
				</div>
			`;
		}

		const champBanner = container.querySelector('#bracket-champion-banner');
		if (champBanner) {
			const winner = champion || (finalMatch.winner && finalMatch.winner !== 'TBD' ? finalMatch.winner : null);
			if (winner) {
				champBanner.hidden = false;
				champBanner.querySelector('#champ-name').textContent = winner;
			} else {
				champBanner.hidden = true;
			}
		}
	};

	try {
		const res = await fetch('/api/site/bracket', { cache: 'no-store' });
		if (res.ok) {
			const data = await res.json();
			const b = data.bracket || data;
			if (b) {
				r1 = b.round1 || [];
				qf = b.quarterFinals || [];
				sf = b.semiFinals || [];
				finalMatch = b.finalMatch || { p1: 'TBD', p2: 'TBD', winner: null };
				champion = b.champion || null;
				renderBracket();
			}
		}
	} catch (err) {
		console.warn('Could not load official cup bracket:', err);
	}
};

/* ==========================================================================
   FEATURE 4: INTERACTIVE TACTICAL PITCH & FORMATION BUILDER
   ========================================================================== */
const initTacticalPitch = () => {
	const container = document.querySelector('#pitch-builder');
	if (!container) return;

	const formationSelect = container.querySelector('#formation-select');
	const playstyleTabs = container.querySelectorAll('.playstyle-tab');
	const pitchPlayersLayer = container.querySelector('#pitch-players-layer');

	const formations = {
		'4-3-3': [
			{ role: 'GK', x: 50, y: 88, name: 'GK · Offensive Goalkeeper', duty: 'Sweeper keeper. Distributes quickly under pressure.', traits: 'High Reach, Parrying, Low Punt trajectory.' },
			{ role: 'LB', x: 16, y: 72, name: 'LB · Attacking Full-back', duty: 'Provides wide support, overlaps winger, crosses into the box.', traits: 'Pace (86+), Pinpoint Crossing skill.' },
			{ role: 'CB', x: 38, y: 76, name: 'LCB · Build Up', duty: 'Deep distributor. steps up to snuff out counters.', traits: 'Interception, Man Marking, Low Pass (80+).' },
			{ role: 'CB', x: 62, y: 76, name: 'RCB · Extra Frontman', duty: 'Physical ball winner. Drives into midfield when space opens.', traits: 'Physical Contact (90+), Heading, Blocker.' },
			{ role: 'RB', x: 84, y: 72, name: 'RB · Defensive Full-back', duty: 'Tucks inside into a back 3 in possession, eliminates breakaways.', traits: 'Tackling, Defensive Awareness, High Stamina.' },
			{ role: 'DMF', x: 50, y: 58, name: 'DMF · Anchor Man', duty: 'Protective shield. Never leaves zone in front of central defenders.', traits: 'Through Passing, Fighting Spirit, Interception.' },
			{ role: 'CMF', x: 32, y: 46, name: 'LCMF · Box-to-Box', duty: 'Relentless engine. Covers ground between both penalty boxes.', traits: 'Stamina (92+), Aggression, Balance.' },
			{ role: 'AMF', x: 68, y: 44, name: 'RAMF · Hole Player', duty: 'Arrives late in the box to finish cutbacks and loose balls.', traits: 'Offensive Awareness, First-time Shot, Dribbling.' },
			{ role: 'LWF', x: 18, y: 24, name: 'LWF · Prolific Winger', duty: 'Cuts inside onto right foot, exploits space behind full-back.', traits: 'Speed (90+), Acceleration, Double Touch.' },
			{ role: 'CF', x: 50, y: 16, name: 'CF · Goal Poacher', duty: 'Shoulder of last man. Clinical direct finisher.', traits: 'Finishing (90+), Acceleration, Knuckle Shot.' },
			{ role: 'RWF', x: 82, y: 24, name: 'RWF · Roaming Flank', duty: 'Drifts inside toward half-space, links with central play.', traits: 'Tight Possession, Curler, One-touch Pass.' }
		],
		'4-2-1-3': [
			{ role: 'GK', x: 50, y: 88, name: 'GK · Defensive Keeper', duty: 'Stays anchored on line. Elite shot stopping reactions.', traits: 'High Reflexes, Parrying, Diving.' },
			{ role: 'LB', x: 16, y: 72, name: 'LB · Full-back Finisher', duty: 'Underlaps through central lanes to create overloads.', traits: 'Dribbling, Balance, Acceleration.' },
			{ role: 'CB', x: 38, y: 76, name: 'LCB · The Destroyer', duty: 'Aggressively steps out to tackle forwards before they turn.', traits: 'Aggression, Physical Contact, Sliding Tackle.' },
			{ role: 'CB', x: 62, y: 76, name: 'RCB · Build Up', duty: 'Calm presence. Long lofted pass switches to wingers.', traits: 'Lofted Pass (84+), Aerial Superiority.' },
			{ role: 'RB', x: 84, y: 72, name: 'RB · Attacking Full-back', duty: 'Whipped early crosses into target striker.', traits: 'Pinpoint Crossing, Stamina.' },
			{ role: 'DMF', x: 38, y: 60, name: 'LDMF · Anchor Man', duty: 'Stops counter through the central channel.', traits: 'Defensive Awareness, Anchor duty.' },
			{ role: 'DMF', x: 62, y: 60, name: 'RDMF · Orchestrator', duty: 'Deep-lying playmaker. Dictates game tempo from deep.', traits: 'Low Pass (90+), One-touch Pass, Through Passing.' },
			{ role: 'AMF', x: 50, y: 40, name: 'AMF · Creative Playmaker', duty: 'Finds pockets between lines; threads decisive through balls.', traits: 'Tight Possession, Vision, Through Passing.' },
			{ role: 'LWF', x: 18, y: 22, name: 'LWF · Prolific Winger', duty: 'Speed merchant. Stretches opposing defensive shape wide.', traits: 'Acceleration (94+), Speed.' },
			{ role: 'CF', x: 50, y: 15, name: 'CF · Target Man', duty: 'Shields ball with physical frame, lays off to wingers.', traits: 'Physical Contact (92+), Heading, One-touch Pass.' },
			{ role: 'RWF', x: 82, y: 22, name: 'RWF · Roaming Flank', duty: 'Diagonal cut-in runs toward the near post.', traits: 'Curler, Balance, Finishing.' }
		],
		'4-2-2-2': [
			{ role: 'GK', x: 50, y: 88, name: 'GK · Offensive Goalkeeper', duty: 'Modern proactive keeper.', traits: 'Reach, Parrying.' },
			{ role: 'LB', x: 16, y: 72, name: 'LB · Defensive Full-back', duty: 'Solid backline anchor.', traits: 'Tackling, Awareness.' },
			{ role: 'CB', x: 38, y: 76, name: 'LCB · Build Up', duty: 'Safe distribution.', traits: 'Interception, Aerial Superiority.' },
			{ role: 'CB', x: 62, y: 76, name: 'RCB · The Destroyer', duty: 'Aggressive stopper.', traits: 'Aggression, Physical Contact.' },
			{ role: 'RB', x: 84, y: 72, name: 'RB · Defensive Full-back', duty: 'Locks down wide danger.', traits: 'Tackling, Speed.' },
			{ role: 'DMF', x: 38, y: 62, name: 'LDMF · Anchor Man', duty: 'Prevents central penetrations.', traits: 'Interception, Block.' },
			{ role: 'CMF', x: 62, y: 62, name: 'RCMF · Box-to-Box', duty: 'Transition connector.', traits: 'Stamina, Pass, Tackling.' },
			{ role: 'AMF', x: 28, y: 42, name: 'LAMF · Hole Player', duty: 'Exploits half space left.', traits: 'Offensive Awareness, Finishing.' },
			{ role: 'AMF', x: 72, y: 42, name: 'RAMF · Creative Playmaker', duty: 'Feeds the strike duo.', traits: 'One-touch Pass, Through Passing.' },
			{ role: 'CF', x: 38, y: 18, name: 'LCF · Goal Poacher', duty: 'Runs off the shoulder.', traits: 'Speed, Finishing.' },
			{ role: 'SS', x: 62, y: 22, name: 'RSS · Deep-Lying Forward', duty: 'Drops deep, draws out center-back.', traits: 'First-time Pass, Ball Control.' }
		],
		'3-2-4-1': [
			{ role: 'GK', x: 50, y: 88, name: 'GK · Offensive Goalkeeper', duty: 'Sweeps behind a high back three.', traits: 'Speed, Reflexes.' },
			{ role: 'CB', x: 25, y: 75, name: 'LCB · Extra Frontman', duty: 'Steps out to support wide midfield.', traits: 'Passing, Interception.' },
			{ role: 'CB', x: 50, y: 77, name: 'CCB · Build Up', duty: 'Defensive linchpin.', traits: 'Height, Heading, Tackling.' },
			{ role: 'CB', x: 75, y: 75, name: 'RCB · The Destroyer', duty: 'Physical duels on the right.', traits: 'Physicality, Slide Tackle.' },
			{ role: 'DMF', x: 38, y: 60, name: 'LDMF · Orchestrator', duty: 'Controls rhythm and switches flank.', traits: 'Vision, Pass.' },
			{ role: 'DMF', x: 62, y: 60, name: 'RDMF · Anchor Man', duty: 'Locks central access.', traits: 'Interception, Awareness.' },
			{ role: 'LMF', x: 14, y: 42, name: 'LMF · Cross Specialist', duty: 'Hugs the touchline, early aerial deliveries.', traits: 'Crossing, Curve.' },
			{ role: 'AMF', x: 38, y: 38, name: 'LAMF · Hole Player', duty: 'Box infiltrator.', traits: 'Runs from deep, Finishing.' },
			{ role: 'AMF', x: 62, y: 38, name: 'RAMF · Hole Player', duty: 'Secondary box infiltrator.', traits: 'Acceleration, Dribble.' },
			{ role: 'RMF', x: 86, y: 42, name: 'RMF · Prolific Winger', duty: '1v1 isolations out wide.', traits: 'Pace, Skill Moves.' },
			{ role: 'CF', x: 50, y: 16, name: 'CF · Goal Poacher', duty: 'Sole reference point for finishes.', traits: 'Clinical Finishing, Awareness.' }
		],
		'5-2-1-2': [
			{ role: 'GK', x: 50, y: 88, name: 'GK · Defensive Goalkeeper', duty: 'Brick wall behind 5-man line.', traits: 'Reflexes, Reach.' },
			{ role: 'LWB', x: 14, y: 66, name: 'LWB · Offensive Full-back', duty: 'Sprints whole left corridor.', traits: 'Stamina, Speed, Crossing.' },
			{ role: 'CB', x: 32, y: 78, name: 'LCB · Build Up', duty: 'Left central cover.', traits: 'Interception, Passing.' },
			{ role: 'CB', x: 50, y: 80, name: 'CCB · Extra Frontman', duty: 'Central aerial sweeper.', traits: 'Aerial Superiority, Heading.' },
			{ role: 'CB', x: 68, y: 78, name: 'RCB · The Destroyer', duty: 'Right central enforcer.', traits: 'Aggression, Physical.' },
			{ role: 'RWB', x: 86, y: 66, name: 'RWB · Offensive Full-back', duty: 'Right corridor engine.', traits: 'Stamina, Speed.' },
			{ role: 'DMF', x: 40, y: 56, name: 'LDMF · Anchor Man', duty: 'Blocks central through balls.', traits: 'Interception.' },
			{ role: 'CMF', x: 60, y: 56, name: 'RCMF · Box-to-Box', duty: 'Carries ball into attacking transition.', traits: 'Ball Carrying, Stamina.' },
			{ role: 'AMF', x: 50, y: 38, name: 'AMF · Classic No. 10', duty: 'Static playmaker; distributes to strikers.', traits: 'Through Ball, Vision.' },
			{ role: 'CF', x: 38, y: 18, name: 'LCF · Goal Poacher', duty: 'Counter-attack spearhead.', traits: 'Speed, Finishing.' },
			{ role: 'CF', x: 62, y: 18, name: 'RCF · Fox in the Box', duty: 'Prowls inside the 18-yard box.', traits: 'Heading, First-time Shot.' }
		]
	};

	const playstyleData = {
		'quick-counter': {
			title: 'Quick Counter',
			desc: 'High defensive line, rapid forward transitions immediately upon winning possession. Wingers sprint behind opponent full-backs while CF pins center-backs.',
			defLine: 85,
			press: 'High / Aggressive',
			speed: 'Instant / Direct'
		},
		'possession': {
			title: 'Possession Game',
			desc: 'Sustained patient build-up. Teammates drop into open space to offer safe passing angles. Wingers stretch wide while central midfielders circulate to tire out the opponent.',
			defLine: 65,
			press: 'Frontline Press',
			speed: 'Patient / Calculated'
		},
		'long-ball-counter': {
			title: 'Long Ball Counter',
			desc: 'Compact low defensive block. Defenders absorb pressure deep in the final third, then immediately launch long diagonal balls into space for sprinting attackers.',
			defLine: 35,
			press: 'Deep All-out Defense',
			speed: 'Rapid Vertical'
		},
		'out-wide': {
			title: 'Out Wide',
			desc: 'Full-backs and wingers overload touchlines. Midfielders shift play into wide corridors to deliver curling crosses onto aerially dominant strikers inside the box.',
			defLine: 68,
			press: 'Wide Containment',
			speed: 'Medium / Flank Heavy'
		}
	};

	let currentFormationKey = '4-2-1-3';
	let selectedPlayerIndex = 9; // Default to CF

	const renderPlayers = () => {
		const squad = formations[currentFormationKey] || formations['4-2-1-3'];
		pitchPlayersLayer.innerHTML = squad.map((p, idx) => `
			<button type="button" class="player-token ${idx === selectedPlayerIndex ? 'is-selected' : ''}" style="left: ${p.x}%; top: ${p.y}%;" data-player-idx="${idx}" aria-label="${p.name}">
				<span class="token-role">${p.role}</span>
			</button>
		`).join('');

		updatePlayerDetail();
	};

	const updatePlayerDetail = () => {
		const squad = formations[currentFormationKey] || formations['4-2-1-3'];
		const p = squad[selectedPlayerIndex] || squad[0];

		container.querySelector('#role-tag').textContent = `${p.role} · Tactical Assignment`;
		container.querySelector('#role-title').textContent = p.name;
		container.querySelector('#role-instruction').textContent = p.duty;
		container.querySelector('#role-traits').textContent = p.traits;
	};

	pitchPlayersLayer.addEventListener('click', (e) => {
		const token = e.target.closest('.player-token');
		if (!token) return;
		selectedPlayerIndex = Number(token.dataset.playerIdx);
		renderPlayers();
	});

	formationSelect.addEventListener('change', () => {
		currentFormationKey = formationSelect.value;
		selectedPlayerIndex = 9; // Reset to CF
		renderPlayers();
	});

	playstyleTabs.forEach((tab) => {
		tab.addEventListener('click', () => {
			playstyleTabs.forEach((t) => {
				t.classList.remove('is-active');
				t.setAttribute('aria-selected', 'false');
			});
			tab.classList.add('is-active');
			tab.setAttribute('aria-selected', 'true');

			const ps = playstyleData[tab.dataset.playstyle];
			if (ps) {
				container.querySelector('#tactical-playstyle-title').textContent = ps.title;
				container.querySelector('#tactical-playstyle-desc').textContent = ps.desc;
				container.querySelector('#stat-def-line').style.width = `${ps.defLine}%`;
				container.querySelector('#stat-press').textContent = ps.press;
				container.querySelector('#stat-speed').textContent = ps.speed;
			}
		});
	});

	renderPlayers();
};

// Synchronize live rankings and club standings directly onto the home page
const initHomePageLiveSync = async () => {
	const playerTable = document.querySelector('#home-player-rankings');
	const clubTable = document.querySelector('#home-team-rankings');
	const heroPlayersCount = document.querySelector('#hero-stat-players');

	if (!playerTable && !clubTable) return;

	try {
		// 1. Fetch live player rankings
		const resPlayers = await fetch('/api/rankings/live', { cache: 'no-store' });
		if (resPlayers.ok) {
			const data = await resPlayers.json();
			const players = data.players || [];
			if (heroPlayersCount && players.length > 0) {
				heroPlayersCount.textContent = `${players.length}+`;
			}

			if (playerTable && players.length > 0) {
				const topPlayers = players.slice(0, 4);
				playerTable.innerHTML = topPlayers
					.map((p, idx) => {
						const rankNum = idx + 1;
						const badgeClass = rankNum === 1 ? 'rank-1' : rankNum === 2 ? 'rank-2' : rankNum === 3 ? 'rank-3' : 'rank-other';
						const elo = Number(p.rating) || 1200;
						const wins = Number(p.wins) || 0;
						const draws = Number(p.draws) || 0;
						const losses = Number(p.losses) || 0;
						const name = p.gamerTag || p.name || 'Anonymous';
						return `
							<tr>
								<td><span class="home-rank-num ${badgeClass}">#${rankNum}</span></td>
								<td><strong>${name}</strong></td>
								<td><span class="home-rank-elo">${elo.toLocaleString()} Elo</span></td>
								<td><span class="home-rank-rec">${wins}W-${draws}D-${losses}L</span></td>
							</tr>
						`;
					})
					.join('');
			}
		}
	} catch (err) {
		console.warn('Live player sync notice:', err);
	}

	try {
		// 2. Fetch live club standings
		const resClubs = await fetch('/api/site/clubs', { cache: 'no-store' });
		if (resClubs.ok) {
			const data = await resClubs.json();
			const clubs = data.clubs || [];

			if (clubTable && clubs.length > 0) {
				const topClubs = clubs.slice(0, 4);
				clubTable.innerHTML = topClubs
					.map((c, idx) => {
						const rankNum = idx + 1;
						const badgeClass = rankNum === 1 ? 'rank-1' : rankNum === 2 ? 'rank-2' : rankNum === 3 ? 'rank-3' : 'rank-other';
						const pts = Number(c.points) || 0;
						const rec = c.record || '0W-0D-0L';
						return `
							<tr>
								<td><span class="home-rank-num ${badgeClass}">#${rankNum}</span></td>
								<td><strong>${c.name}</strong></td>
								<td><span class="home-rank-elo">${pts} pts</span></td>
								<td><span class="home-rank-rec">${rec}</span></td>
							</tr>
						`;
					})
					.join('');
			}
		}
	} catch (err) {
		console.warn('Live club sync notice:', err);
	}
};

// Initialize interactive widgets on load
initH2HPredictor();
initEloCalculator();
initCupBracket();
initTacticalPitch();
initHomePageLiveSync();

if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('./sw.js').catch(() => {
		// The interface remains usable when service workers are unavailable.
	});
}

