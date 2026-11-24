const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.navigation');

// Keep player identity visible when a stored avatar cannot be fetched after deployment.
document.addEventListener('error', (event) => {
	const image = event.target;
	if (!(image instanceof HTMLImageElement)) return;
	const frame = image.closest('.rank-avatar, .player-directory-avatar, .matches-team-badge, .tournament-participant-avatar, .profile-avatar-lg, .profile-photo-preview, .profile-history-avatar');
	if (!frame || frame.dataset.avatarFallbackApplied === 'true') return;
	frame.dataset.avatarFallbackApplied = 'true';
	const label = (image.dataset.fallback || image.alt || '').replace(/profile photo|current profile photo/ig, '').trim();
	image.remove();
	if (frame.classList.contains('profile-history-avatar')) {
		frame.replaceWith(Object.assign(document.createElement('span'), { className: 'profile-history-avatar avatar-initial-fallback', textContent: label.charAt(0).toUpperCase() || 'P' }));
	} else {
		frame.textContent = label.charAt(0).toUpperCase() || 'P';
		frame.setAttribute('aria-label', `${label || 'Player'} photo unavailable`);
	}
}, true);

if (!document.querySelector('.skip-link')) {
	const main = document.querySelector('main');
	if (main && !main.id) main.id = 'main-content';
	const skipLink = document.createElement('a');
	skipLink.className = 'skip-link';
	skipLink.href = '#main-content';
	skipLink.textContent = 'Skip to main content';
	document.body.prepend(skipLink);
}

if (menuToggle && navigation) {
	menuToggle.addEventListener('click', () => {
		const isOpen = navigation.classList.toggle('is-open');
		menuToggle.setAttribute('aria-expanded', String(isOpen));
	});
}

const syncAccountNavigation = async () => {
	const list = document.querySelector('.navigation ul');
	if (!list) return;
	let authenticated = false;
	try {
		const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
		if (!response.ok) throw new Error('Account session could not be checked.');
		authenticated = (await response.json()).authenticated === true;
	} catch {
		list.dataset.authState = 'unknown';
		return;
	}

	list.dataset.authState = authenticated ? 'signed-in' : 'signed-out';
	list.querySelectorAll('.nav-auth-item').forEach((item) => item.remove());
	const returnPath = `${location.pathname}${location.search}${location.hash}`;
	const createAuthItem = (label, href, action) => {
		const item = document.createElement('li');
		item.className = 'nav-auth-item';
		if (action) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'navigation-auth-button';
			button.textContent = label;
			button.addEventListener('click', async () => {
				button.disabled = true;
				try {
					const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
					if (!response.ok) throw new Error('Could not sign out. Please try again.');
					location.replace('login.html');
				} catch (error) {
					button.disabled = false;
					window.alert(error.message);
				}
			});
			item.append(button);
		} else {
			const link = document.createElement('a');
			link.href = href;
			link.textContent = label;
			item.append(link);
		}
		list.append(item);
	};

	if (authenticated) {
		createAuthItem('My Profile', 'profile.html');
		createAuthItem('Log out', '', true);
	} else {
		const next = encodeURIComponent(returnPath || 'index.html');
		createAuthItem('Sign in', `login.html?next=${next}`);
		createAuthItem('Create account', `signup.html?next=${next}`);
	}

	const signInLink = document.querySelector('.header-sign-in');
	if (signInLink) {
		signInLink.href = authenticated ? 'profile.html' : `login.html?next=${encodeURIComponent(returnPath || 'index.html')}`;
		signInLink.textContent = authenticated ? 'My Profile' : 'Sign in';
	}
	document.querySelectorAll('.header-action[href="signup.html"]').forEach((link) => {
		if (authenticated) link.hidden = true;
		else link.href = `signup.html?next=${encodeURIComponent(returnPath || 'index.html')}`;
	});
};
syncAccountNavigation();

const syncLeagueConfigUi = () => {
	const config = window.LEAGUE_CONFIG;
	config.tiers.forEach((tier) => {
		const card = document.querySelector(`[data-tier-card="${tier.id}"]`);
		card?.querySelector('[data-tier-name]')?.replaceChildren(document.createTextNode(tier.name));
		card?.querySelector('[data-tier-range]')?.replaceChildren(document.createTextNode(config.formatTierRange(tier)));
		const benchmark = document.querySelector(`[data-tier-benchmark="${tier.id}"]`);
		if (benchmark) benchmark.textContent = tier.max === null
			? `${tier.name} (${tier.min.toLocaleString()}+)`
			: tier.min === 0
				? `${tier.name} (<${(tier.max + 1).toLocaleString()})`
				: `${tier.name} (${tier.min.toLocaleString()})`;
		const filterOption = document.querySelector(`[data-tier-filter="${tier.id}"]`);
		if (filterOption) filterOption.textContent = `${tier.name} · ${config.formatTierRange(tier).replace(' rating', '')}`;
	});

	document.querySelectorAll('[data-league-k]').forEach((option) => {
		const kFactor = {
			ranked: config.elo.rankedKFactor,
			cup: config.elo.cupKFactor,
			placement: config.elo.placementKFactor
		}[option.dataset.leagueK];
		if (Number.isFinite(kFactor)) {
			option.value = String(kFactor);
			option.textContent = `${option.dataset.leagueK === 'ranked' ? 'Standard Ranked Match' : option.dataset.leagueK === 'cup' ? 'League Cup / Tournament Knockout' : 'Placement / Provisional Match'} (K = ${kFactor})`;
		}
	});

	document.querySelectorAll('[data-elo-k]').forEach((value) => {
		const kFactor = {
			ranked: config.elo.rankedKFactor,
			cup: config.elo.cupKFactor,
			placement: config.elo.placementKFactor
		}[value.dataset.eloK];
		if (Number.isFinite(kFactor)) value.textContent = String(kFactor);
	});
	document.querySelectorAll('[data-initial-elo]').forEach((value) => {
		value.textContent = config.elo.initialRating.toLocaleString();
	});
	const playTierList = document.querySelector('[data-play-tier-list]');
	if (playTierList) {
		const tiers = config.tiers.map((tier) => {
			const item = document.createElement('li');
			const name = document.createElement('strong');
			name.textContent = tier.name;
			const range = document.createElement('span');
			range.textContent = config.formatTierRange(tier);
			item.append(name, range);
			return item;
		});
		playTierList.replaceChildren(...tiers);
	}
};
syncLeagueConfigUi();

const setupTacticalBuilder = () => {
	const formationSelect = document.querySelector('#formation-select');
	const playerLayer = document.querySelector('#pitch-players-layer');
	if (!formationSelect || !playerLayer) return;

	const formations = {
		'4-3-3': {
			shape: '4-3-3',
			strength: 'Natural wing passing triangles, flank cutbacks, and overlapping channel options.',
			subtactic: 'Wing Rotation · Defensive instruction on Full-backs',
			players: [
				['GK', 50, 90], ['LB', 12, 72], ['LCB', 37, 76], ['RCB', 63, 76], ['RB', 88, 72],
				['DMF', 50, 61], ['LCMF', 32, 49], ['RCMF', 68, 49],
				['LWF', 16, 29], ['CF', 50, 23], ['RWF', 84, 29]
			]
		},
		'4-2-1-3': {
			shape: '4-2-1-3',
			strength: 'Dual pivot midfield shielding with instantaneous 4-man counter-attack punch.',
			subtactic: 'Anchoring on Central DMF · Counter Target on CF',
			players: [
				['GK', 50, 90], ['LB', 12, 72], ['LCB', 37, 76], ['RCB', 63, 76], ['RB', 88, 72],
				['LDMF', 38, 60], ['RDMF', 62, 60], ['AMF', 50, 44],
				['LWF', 17, 29], ['CF', 50, 23], ['RWF', 83, 29]
			]
		},
		'4-1-2-3': {
			shape: '4-1-2-3',
			strength: 'Twin AMF half-space infiltration with devastating wing crosses and box entries.',
			subtactic: 'Deep Line on DMF · Defensive on both Full-backs',
			players: [
				['GK', 50, 90], ['LB', 12, 72], ['LCB', 37, 76], ['RCB', 63, 76], ['RB', 88, 72],
				['DMF', 50, 62], ['LAMF', 33, 44], ['RAMF', 67, 44],
				['LWF', 16, 28], ['CF', 50, 22], ['RWF', 84, 28]
			]
		},
		'4-2-2-2': {
			shape: '4-2-2-2',
			strength: 'Compact dual AMF playmakers feeding a lethal two-striker combination.',
			subtactic: 'Anchoring on LDMF/RDMF · False 9 on one Striker',
			players: [
				['GK', 50, 90], ['LB', 12, 72], ['LCB', 37, 76], ['RCB', 63, 76], ['RB', 88, 72],
				['LDMF', 38, 60], ['RDMF', 62, 60], ['LAMF', 29, 43], ['RAMF', 71, 43],
				['LCF', 40, 24], ['RCF', 60, 24]
			]
		},
		'4-4-2': {
			shape: '4-4-2',
			strength: 'Impermeable two-bank defensive structure with balanced flank crossings.',
			subtactic: 'Centring on Wingers · Tight Marking on opponent AMF',
			players: [
				['GK', 50, 90], ['LB', 12, 72], ['LCB', 37, 76], ['RCB', 63, 76], ['RB', 88, 72],
				['LMF', 14, 52], ['LCMF', 38, 56], ['RCMF', 62, 56], ['RMF', 86, 52],
				['LCF', 40, 24], ['RCF', 60, 24]
			]
		},
		'3-2-4-1': {
			shape: '3-2-4-1',
			strength: 'Dominant 5-man midfield box providing overwhelming passing lanes and ball retention.',
			subtactic: 'Anchoring on Central CB · Defensive on LDMF',
			players: [
				['GK', 50, 90], ['LCB', 25, 76], ['CB', 50, 79], ['RCB', 75, 76],
				['LDMF', 39, 61], ['RDMF', 61, 61], ['LMF', 12, 43], ['LAMF', 39, 42],
				['RAMF', 61, 42], ['RMF', 88, 43], ['CF', 50, 23]
			]
		},
		'3-4-3': {
			shape: '3-4-3',
			strength: 'Aggressive wide traps with simultaneous 3-man forward pressure on turnover.',
			subtactic: 'Deep Line on Wide Midfielders · Counter Target on CF',
			players: [
				['GK', 50, 90], ['LCB', 24, 76], ['CB', 50, 79], ['RCB', 76, 76],
				['LMF', 12, 50], ['LCMF', 38, 56], ['RCMF', 62, 56], ['RMF', 88, 50],
				['LWF', 18, 28], ['CF', 50, 22], ['RWF', 82, 28]
			]
		},
		'4-2-3-1': {
			shape: '4-2-3-1',
			strength: 'Supreme central pitch equilibrium with dedicated number 10 orchestrating.',
			subtactic: 'Anchoring on AMF · Defensive on LDMF',
			players: [
				['GK', 50, 90], ['LB', 12, 72], ['LCB', 37, 76], ['RCB', 63, 76], ['RB', 88, 72],
				['LDMF', 38, 62], ['RDMF', 62, 62], ['LMF', 16, 42], ['AMF', 50, 40], ['RMF', 84, 42],
				['CF', 50, 22]
			]
		},
		'5-2-1-2': {
			shape: '5-2-1-2',
			strength: 'Unbreachable 5-man low block with direct surgical 3-man counter-punch.',
			subtactic: 'Wing Backs on LWB/RWB · Counter Target on Striker',
			players: [
				['GK', 50, 90], ['LCB', 25, 77], ['CB', 50, 79], ['RCB', 75, 77],
				['LWB', 10, 59], ['RWB', 90, 59], ['LCMF', 39, 56], ['RCMF', 61, 56],
				['AMF', 50, 41], ['LCF', 40, 24], ['RCF', 60, 24]
			]
		}
	};

	const roles = {
		GK: {
			name: 'Sweeper Keeper',
			zone: 'gk',
			instruction: 'Stay composed, protect the near post, and offer a safe passing option when possession is secure.',
			traits: 'Awareness, reflexes, distribution',
			controls: [
				{ btn: '△ / Y (Hold)', name: 'Keeper Rush', desc: 'Sprint out to close 1v1 angles on breakaways' },
				{ btn: 'R3 Click + Move', name: 'Manual GK Steer', desc: 'Anticipate curling far-post finesse shots' }
			]
		},
		LB: {
			name: 'Left Full-back',
			zone: 'def',
			instruction: 'Support the left channel when it is safe, then recover quickly to protect the space behind your winger.',
			traits: 'Stamina, defensive awareness, crossing',
			controls: [
				{ btn: 'L2 / LT (Hold)', name: 'Match-Up Contain', desc: 'Block inside cutbacks from tricky wingers' },
				{ btn: 'R2 + ◯ / RT + B', name: 'Stunning Cross', desc: 'Whip curling ball over defenders into 6-yard box' }
			]
		},
		RB: {
			name: 'Right Full-back',
			zone: 'def',
			instruction: 'Balance overlaps with recovery runs; avoid leaving both flanks exposed at once.',
			traits: 'Stamina, defensive awareness, passing',
			controls: [
				{ btn: 'L2 / LT (Hold)', name: 'Match-Up Contain', desc: 'Hold ground and block crossing lanes' },
				{ btn: 'L1 + ◯ / LB + B', name: 'Early Cross', desc: 'Curve ball behind backline from deep flank' }
			]
		},
		LCB: {
			name: 'Cover Centre-back',
			zone: 'def',
			instruction: 'Read through balls and cover the channel while your partner challenges the striker.',
			traits: 'Defensive awareness, speed, tackling',
			controls: [
				{ btn: '▢ x2 / X x2', name: 'Shoulder Charge', desc: 'Cleanly muscle forward off through-balls' },
				{ btn: 'L2 / LT', name: 'Jockey & Intercept', desc: 'Cut off threaded passing vectors' }
			]
		},
		RCB: {
			name: 'Stopper Centre-back',
			zone: 'def',
			instruction: 'Hold the central line, contest the striker, and keep your clearances away from danger.',
			traits: 'Physical contact, tackling, aerial strength',
			controls: [
				{ btn: '◯ / B (Tap)', name: 'Emergency Clear', desc: 'First-time header or boot out of danger' },
				{ btn: 'L2 / LT', name: 'Shot Block', desc: 'Spread body to deflect goalbound strikes' }
			]
		},
		CB: {
			name: 'Central Centre-back',
			zone: 'def',
			instruction: 'Protect the central lane and keep the back line connected as the ball moves across the pitch.',
			traits: 'Defensive awareness, heading, passing',
			controls: [
				{ btn: 'L2 / LT (Hold)', name: 'Match-Up Pivot', desc: 'Anchor central danger zone' },
				{ btn: '▢ x2 / X x2', name: 'Physical Duel', desc: 'Dispossess shielding target man' }
			]
		},
		DMF: {
			name: 'Anchor Midfielder',
			zone: 'mid',
			instruction: 'Screen the defence, close central passing lanes, and offer a simple outlet after a regain.',
			traits: 'Defensive awareness, ball winning, short passing',
			controls: [
				{ btn: 'L2 / LT (Hold)', name: 'Match-Up Wall', desc: 'Block central through-balls before 18-yard box' },
				{ btn: '✕ / A (Tap)', name: 'First-Time Release', desc: 'Quick release to playmaker without taking a touch' }
			]
		},
		LDMF: {
			name: 'Left Pivot',
			zone: 'mid',
			instruction: 'Protect the left half-space and move the ball forward without breaking the team’s shape.',
			traits: 'Interception, balance, short passing',
			controls: [
				{ btn: 'L2 / LT', name: 'Passing Lane Intercept', desc: 'Step into passing lanes cleanly' },
				{ btn: 'R2 + ✕ / RT + A', name: 'Stunning Low Pass', desc: 'Driven ball straight to the wingers' }
			]
		},
		RDMF: {
			name: 'Right Pivot',
			zone: 'mid',
			instruction: 'Cover the right half-space and stay connected to the centre-backs during transitions.',
			traits: 'Interception, stamina, passing',
			controls: [
				{ btn: 'L2 / LT', name: 'Match-Up Shield', desc: 'Provide defensive cover for overlapping RB' },
				{ btn: 'L1 + △ / LB + Y', name: 'Lofted Switch', desc: 'Ping diagonal pass to open opposite flank' }
			]
		},
		LCMF: {
			name: 'Left Central Midfielder',
			zone: 'mid',
			instruction: 'Link build-up to attack, support the left side, and track runners when possession changes.',
			traits: 'Stamina, ball control, through passing',
			controls: [
				{ btn: 'L1 + ✕ / LB + A', name: 'Give-and-Go (1-2)', desc: 'Pass and sprint forward into half-space' },
				{ btn: 'R2 + △ / RT + Y', name: 'Stunning Through Pass', desc: 'Thread needle between CB and LB' }
			]
		},
		RCMF: {
			name: 'Right Central Midfielder',
			zone: 'mid',
			instruction: 'Connect the right channel to the centre and arrive late when the attacking shape allows.',
			traits: 'Stamina, passing, ball control',
			controls: [
				{ btn: 'R1 + R2 / RB + RT', name: 'Super Cancel', desc: 'Break movement lock to intercept rebound' },
				{ btn: 'R2 + ▢ / RT + X', name: 'Edge-of-Box Strike', desc: 'Unleash stunning shot from second-ball rebound' }
			]
		},
		AMF: {
			name: 'Advanced Playmaker',
			zone: 'mid',
			instruction: 'Find pockets between the lines, turn into space, and create the final pass for the forwards.',
			traits: 'Vision, tight possession, through passing',
			controls: [
				{ btn: 'R2 + △ / RT + Y', name: 'Stunning Through Ball', desc: 'Weighted curler into striker’s stride' },
				{ btn: 'Right Stick Flick', name: 'Double Touch Skill', desc: 'Glide past approaching DMF effortlessly' },
				{ btn: 'L1 + ✕ / LB + A', name: 'Wall Pass Trigger', desc: 'Set up rapid one-two at top of box' }
			]
		},
		LAMF: {
			name: 'Left Attacking Midfielder',
			zone: 'mid',
			instruction: 'Combine with the striker and full-back, then attack the inside channel when space opens.',
			traits: 'Agility, passing, finishing',
			controls: [
				{ btn: 'L3 Gentle + R2', name: 'Finesse Dribble', desc: 'Slip between defender’s recovery challenge' },
				{ btn: 'R2 + ▢ / RT + X', name: 'Far Post Curler', desc: 'Curl stunning strike into top right corner' }
			]
		},
		RAMF: {
			name: 'Right Attacking Midfielder',
			zone: 'mid',
			instruction: 'Offer a close passing option and time runs into the right half-space.',
			traits: 'Ball control, vision, finishing',
			controls: [
				{ btn: 'R2 + △ / RT + Y', name: 'Incisive Ground Pass', desc: 'Cut defence open toward right striker' },
				{ btn: 'L2 / LT', name: 'Body Shielding', desc: 'Hold off centre-back before releasing pass' }
			]
		},
		LWF: {
			name: 'Left Winger',
			zone: 'atk',
			instruction: 'Stretch the pitch, then choose whether to attack the byline or cut inside based on the defender.',
			traits: 'Acceleration, dribbling, crossing',
			controls: [
				{ btn: 'R2 Double Tap / RT x2', name: 'Burst Sprint', desc: 'Explode past full-back into open touchline' },
				{ btn: 'R2 + ▢ / RT + X', name: 'Finesse Curler', desc: 'Cut inside on right foot and curl top bins' },
				{ btn: 'R2 + ◯ / RT + B', name: 'Driven Low Cross', desc: 'Drill ball across face of goal for tap-in' }
			]
		},
		RWF: {
			name: 'Right Winger',
			zone: 'atk',
			instruction: 'Keep width in transition and make a decisive run once the ball carrier has control.',
			traits: 'Acceleration, dribbling, finishing',
			controls: [
				{ btn: 'Right Stick + Left Stick', name: 'Chop / Cut Turn', desc: 'Snap back inside defender’s sliding challenge' },
				{ btn: 'R2 + ◯ / RT + B', name: 'Far-Post Pinpoint Cross', desc: 'Loft pinpoint cross to arriving CF' }
			]
		},
		LMF: {
			name: 'Left Wide Midfielder',
			zone: 'mid',
			instruction: 'Provide width, support the wing-back, and recover into the midfield line when defending.',
			traits: 'Stamina, crossing, defensive work rate',
			controls: [
				{ btn: 'R2 + ◯ / RT + B', name: 'Deep Early Cross', desc: 'Whip ball early while strikers are in motion' },
				{ btn: 'L2 / LT', name: 'Track Back Tackle', desc: 'Help full-back double team opponent winger' }
			]
		},
		RMF: {
			name: 'Right Wide Midfielder',
			zone: 'mid',
			instruction: 'Stretch the right flank and help protect the outside channel when possession is lost.',
			traits: 'Stamina, crossing, defensive work rate',
			controls: [
				{ btn: 'R2 + ✕ / RT + A', name: 'Driven Diagonal', desc: 'Switch play quickly across to opposite flank' },
				{ btn: 'L1 + ✕ / LB + A', name: 'Overlap Trigger', desc: 'Release RB and run inside into box' }
			]
		},
		LWB: {
			name: 'Left Wing-back',
			zone: 'def',
			instruction: 'Provide the left side’s width, but time forward runs so the back three are not left isolated.',
			traits: 'Stamina, speed, crossing',
			controls: [
				{ btn: 'R2 Double Tap', name: 'Touchline Blast', desc: 'Fly down flank into crossing zone' },
				{ btn: 'L2 / LT', name: 'Recovery Jockey', desc: 'Funnel attacker into the 3 centre-backs' }
			]
		},
		RWB: {
			name: 'Right Wing-back',
			zone: 'def',
			instruction: 'Push into space on the right and recover quickly to restore the back five.',
			traits: 'Stamina, speed, defensive awareness',
			controls: [
				{ btn: 'L1 + ◯ / LB + B', name: 'Swerving Cross', desc: 'Curling delivery away from goalkeeper' },
				{ btn: 'L2 / LT', name: 'Flank Lockdown', desc: 'Prevent crosses from entering 18-yard box' }
			]
		},
		CF: {
			name: 'Centre-forward',
			zone: 'atk',
			instruction: 'Pin the centre-backs, offer a passing target, and time runs across the defensive line.',
			traits: 'Finishing, offensive awareness, acceleration',
			controls: [
				{ btn: 'R2 + ▢ / RT + X', name: 'Stunning Shot', desc: 'Unleash thunderous dipped strike from distance' },
				{ btn: 'L2 / LT', name: 'Manual Shield', desc: 'Hold off centre-back before laying ball off' },
				{ btn: 'L1 + △ / LB + Y', name: 'Shoulder Run Break', desc: 'Time run on shoulder of offside trap' }
			]
		},
		LCF: {
			name: 'Left Striker',
			zone: 'atk',
			instruction: 'Work across the left channel and combine with the attacking midfielder before making a run in behind.',
			traits: 'Finishing, acceleration, off-ball movement',
			controls: [
				{ btn: 'R2 + ▢ / RT + X', name: 'Far Post Finesse', desc: 'Curl clinical shot around outstretched GK' },
				{ btn: '✕ / A (Tap)', name: 'Layoff Pass', desc: 'Set up partner striker for first-time shot' }
			]
		},
		RCF: {
			name: 'Right Striker',
			zone: 'atk',
			instruction: 'Stay connected to the partner striker and attack the space the defence leaves open.',
			traits: 'Finishing, balance, offensive awareness',
			controls: [
				{ btn: 'R2 + ▢ / RT + X', name: 'Near-Post Blast', desc: 'Hammer stunning shot past keeper’s ear' },
				{ btn: 'Right Stick Flick', name: 'Body Feint', desc: 'Shift weight to create half-yard shooting window' }
			]
		}
	};

	const playstyles = {
		'quick-counter': {
			title: 'Quick Counter',
			description: 'Look to break forward immediately upon winning the ball. High defensive line pushes up to compress space, releasing wide runners and a central striker instantaneously.',
			line: 85, lineLabel: 'Very High', press: 'High · Aggressive Overload', speed: 'Instant · Vertical Sprint',
			best: 'You want to win the ball high and score in 3 passes',
			watch: 'A high line leaves large space behind for long balls',
			countersWell: 'Possession Game & Slow Patient Build-Up',
			counterAlert: 'Long Ball Counter & Rapid Route One Outlets'
		},
		possession: {
			title: 'Possession Game',
			description: 'Use close passing triangles to maintain 60%+ possession and pull the opponent out of position. Patient circulation with short triangles creates openings.',
			line: 62, lineLabel: 'Balanced', press: 'Measured · Compact Block', speed: 'Patient · Tiki-Taka Triangles',
			best: 'You are comfortable controlling tempo and breaking blocks',
			watch: 'Turnovers in midfield invite devastating counters',
			countersWell: 'Mid-blocks & Deep Compact 5-Back Defences',
			counterAlert: 'High Press Quick Counter & Flank Overloads'
		},
		'long-ball-counter': {
			title: 'Long Ball Counter',
			description: 'Deep compact defensive line drops naturally to neutralize pace. Once won, long driven passes unleash target strikers and rapid wingers with massive space to attack.',
			line: 42, lineLabel: 'Compact Low', press: 'Selective · Mid/Low Block', speed: 'Direct · Long Outlet Delivery',
			best: 'You face pace spammers or high-line Quick Counter teams',
			watch: 'Lone striker can get isolated without midfield support',
			countersWell: 'High Defensive Lines & Ultra-Pressing Systems',
			counterAlert: 'Patient Possession Teams who recycle safely'
		},
		'out-wide': {
			title: 'Out Wide',
			description: 'Maximize pitch width to isolate full-backs 1-on-1 and whip dangerous early crosses. Midfielders make delayed late box entries for cutbacks.',
			line: 68, lineLabel: 'Balanced-High', press: 'Wide · Flank Pressure', speed: 'Wide · Cross & Switch Play',
			best: 'You have tall, clinical headers and crossing specialists',
			watch: 'Central midfield can be exposed on quick turnovers',
			countersWell: 'Narrow 4-3-1-2 / 4-2-2-2 Formations lacking flank cover',
			counterAlert: 'Quick Counter Wingers attacking vacated fullback channels'
		}
	};

	const situations = {
		chasing: {
			system: '4-1-2-3 · Quick Counter',
			desc: 'Push attacking mentality to +1 or +2 Red on D-pad. Sub on explosive super-sub wingers and flood the penalty box with runners.',
			instructions: [
				{ title: 'Attacking Fullbacks', detail: 'Sends both full-backs overlapping high to create 3v2 flank overloads.' },
				{ title: 'Counter Target', detail: 'Assign to CF to keep them permanently forward, pinning both center-backs.' }
			],
			dpad: '+1 or +2 Red (Ultra Attacking)'
		},
		protecting: {
			system: '5-2-1-2 · Long Ball Counter',
			desc: 'Drop attacking mentality to -1 Blue on D-pad. Contract backline depth and slow down restart sequences to kill opponent momentum.',
			instructions: [
				{ title: 'Deep Line', detail: 'Assign to DMF to drop into backline forming a 6-man defensive wall.' },
				{ title: 'Defensive', detail: 'Assign to both Full-backs / Wing-backs to forbid forward overlaps.' }
			],
			dpad: '-1 Blue (Defensive Stability)'
		},
		'low-block': {
			system: '3-2-4-1 · Possession Game',
			desc: 'Overload the central half-spaces with 5 midfielders. Do not force early passes; circulate patiently and use stunning shots from 22 yards.',
			instructions: [
				{ title: 'Centring', detail: 'Wingers cut inside to pull full-backs out of position and create shooting lanes.' },
				{ title: 'False 9', detail: 'Striker drops deep into midfield, dragging a center-back out of the penalty box.' }
			],
			dpad: 'Neutral (Balanced Circulation)'
		},
		'speed-spam': {
			system: '4-2-1-3 · Long Ball Counter',
			desc: 'Deep defensive line naturally neutralizes through-balls over the top. Use Match-Up (L2/LT) to cut running angles without diving in.',
			instructions: [
				{ title: 'Anchoring', detail: 'Assign to DMF to stay strictly central and prevent passing lanes into the striker.' },
				{ title: 'Tight Marking', detail: 'Assign to your fastest CB to stick like glue to their fastest forward.' }
			],
			dpad: 'Neutral or -1 Blue'
		}
	};

	const formationReadout = document.querySelector('#tactical-formation-readout');
	const boardStatus = document.querySelector('#tactical-board-status');
	const playstyleButtons = [...document.querySelectorAll('.playstyle-tab[data-playstyle]')];
	const overview = document.querySelector('#playstyle-overview');
	const situationButtons = [...document.querySelectorAll('.situation-pill[data-situation]')];
	let activePlaystyle = 'quick-counter';

	const selectRole = (slot, button) => {
		playerLayer.querySelectorAll('.pitch-player').forEach((player) => {
			const selected = player === button;
			player.classList.toggle('is-selected', selected);
			player.setAttribute('aria-pressed', String(selected));
		});
		const role = roles[slot[0]] || roles.CMF || { name: 'Player Role', zone: 'mid', instruction: 'Fulfill tactical responsibilities.', traits: 'Awareness, stamina, technique', controls: [] };
		const setText = (selector, value) => {
			const element = document.querySelector(selector);
			if (element) element.textContent = value;
		};

		const roleCard = document.querySelector('#player-role-detail');
		if (roleCard) {
			roleCard.dataset.zone = role.zone || 'mid';
		}
		const zoneEmblem = role.zone === 'atk' ? '⚽' : role.zone === 'def' ? '🛡️' : role.zone === 'gk' ? '🧤' : '⚙️';
		setText('#role-zone-emblem', zoneEmblem);
		setText('#role-tag', `${slot[0]} · Tactical Role · ${(role.zone || 'MID').toUpperCase()} ZONE`);
		setText('#role-slot-pill', `${slot[0]} Selected`);
		setText('#role-title', `${slot[0]} · ${role.name}`);
		setText('#role-instruction', role.instruction);
		setText('#role-traits', role.traits);
		if (boardStatus) boardStatus.textContent = `${slot[0]} selected · ${role.name}`;

		// Render traits as individual stylish chips
		const traitsContainer = document.querySelector('#role-traits-chips');
		if (traitsContainer && role.traits) {
			traitsContainer.replaceChildren();
			role.traits.split(',').forEach((trait) => {
				const chip = document.createElement('span');
				chip.className = 'trait-chip';
				chip.textContent = trait.trim();
				traitsContainer.append(chip);
			});
		}

		// Render controller commands for this role
		const controlsGrid = document.querySelector('#role-controls-grid');
		if (controlsGrid && Array.isArray(role.controls)) {
			controlsGrid.replaceChildren();
			role.controls.forEach((ctrl) => {
				const item = document.createElement('div');
				item.className = 'ctrl-item';
				item.innerHTML = `<span class="ctrl-btn">${ctrl.btn}</span><div><strong>${ctrl.name}</strong><small>${ctrl.desc}</small></div>`;
				controlsGrid.append(item);
			});
		}
	};

	const renderFormation = () => {
		const formationKey = formationSelect.value;
		const formation = formations[formationKey] || formations['4-2-1-3'];
		playerLayer.replaceChildren();
		formation.players.forEach((slot, index) => {
			const role = roles[slot[0]] || { zone: 'mid' };
			const player = document.createElement('button');
			player.type = 'button';
			player.className = `pitch-player pos-${role.zone || 'mid'}`;
			player.style.left = `${slot[1]}%`;
			player.style.top = `${slot[2]}%`;
			player.dataset.position = slot[0];
			player.setAttribute('aria-pressed', 'false');
			player.setAttribute('aria-label', `Select ${slot[0]}, ${roles[slot[0]]?.name || 'team role'}`);
			player.textContent = slot[0].replace('_', ' ');
			player.dataset.number = String(index + 1).padStart(2, '0');
			player.addEventListener('click', () => selectRole(slot, player));
			playerLayer.append(player);
		});
		if (formationReadout) {
			formationReadout.replaceChildren(
				document.createTextNode(formation.shape),
				Object.assign(document.createElement('span'), { textContent: `${formation.players.length} positions` })
			);
		}
		const setText = (selector, value) => {
			const element = document.querySelector(selector);
			if (element) element.textContent = value;
		};
		setText('#formation-strength', formation.strength || 'Balanced tactical structure.');
		setText('#formation-subtactic', formation.subtactic || 'Standard league sub-tactics.');

		const preferred = formation.players.find((slot) => slot[0] === 'CF') || formation.players.find((slot) => slot[0].includes('CF')) || formation.players[0];
		const preferredButton = [...playerLayer.querySelectorAll('.pitch-player')].find((player) => player.dataset.position === preferred[0]);
		selectRole(preferred, preferredButton);
	};

	const renderPlaystyle = (key) => {
		const style = playstyles[key];
		if (!style) return;
		activePlaystyle = key;
		playstyleButtons.forEach((button) => {
			const selected = button.dataset.playstyle === key;
			button.classList.toggle('is-active', selected);
			button.setAttribute('aria-selected', String(selected));
			button.tabIndex = selected ? 0 : -1;
		});
		const setText = (selector, value) => {
			const element = document.querySelector(selector);
			if (element) element.textContent = value;
		};
		const playstyleIcons = {
			'quick-counter': { icon: '⚡', sub: 'High-Press Vertical Transition' },
			possession: { icon: '🎯', sub: 'Patient Triangle Circulation' },
			'long-ball-counter': { icon: '🚀', sub: 'Deep Block & Route One Outlet' },
			'out-wide': { icon: '🌊', sub: 'Touchline Overload & Pinpoint Cross' }
		};
		const meta = playstyleIcons[key] || { icon: '⚽', sub: 'Team Tactical Philosophy' };
		setText('#tactical-playstyle-icon', meta.icon);
		setText('#tactical-playstyle-sub', meta.sub);
		setText('#tactical-playstyle-title', style.title);
		setText('#tactical-playstyle-desc', style.description);
		setText('#stat-press', style.press);
		setText('#stat-speed', style.speed);
		setText('#tactical-best-when', style.best);
		setText('#tactical-watch-for', style.watch);
		setText('#tactical-counters-well', style.countersWell || 'Various styles');
		setText('#tactical-counter-alert', style.counterAlert || 'Watch your shape');
		setText('#stat-line-label', `${style.lineLabel} (${style.line}%)`);

		const line = document.querySelector('#stat-def-line');
		if (line) line.style.width = `${style.line}%`;
		const lineLabel = document.querySelector('#stat-def-line')?.closest('.tactical-stat')?.querySelector('.stat-label-row strong');
		if (lineLabel) lineLabel.textContent = `${style.lineLabel} (${style.line}%)`;
		if (overview) {
			overview.dataset.playstyle = key;
			overview.classList.remove('tactical-content-refresh');
			window.requestAnimationFrame(() => overview.classList.add('tactical-content-refresh'));
		}
	};

	const renderSituation = (key) => {
		const sit = situations[key];
		if (!sit) return;
		situationButtons.forEach((btn) => {
			const sel = btn.dataset.situation === key;
			btn.classList.toggle('is-active', sel);
			btn.setAttribute('aria-selected', String(sel));
		});
		const setText = (selector, value) => {
			const element = document.querySelector(selector);
			if (element) element.textContent = value;
		};
		setText('#situation-system', sit.system);
		setText('#situation-desc', sit.desc);
		setText('#situation-dpad', sit.dpad);
		const list = document.querySelector('#situation-instructions');
		if (list && Array.isArray(sit.instructions)) {
			list.replaceChildren();
			sit.instructions.forEach((ins) => {
				const li = document.createElement('li');
				li.innerHTML = `<strong>${ins.title}:</strong> ${ins.detail}`;
				list.append(li);
			});
		}

		// Update 5-level D-Pad meter
		const sitDpadLevels = {
			chasing: ['1', '2'],
			protecting: ['-1'],
			'low-block': ['0'],
			'speed-spam': ['-1', '0']
		};
		const activeLevels = new Set(sitDpadLevels[key] || ['0']);
		document.querySelectorAll('.dpad-step[data-dpad-step]').forEach((step) => {
			const active = activeLevels.has(step.dataset.dpadStep);
			step.classList.toggle('is-active', active);
		});
	};

	formationSelect.addEventListener('change', renderFormation);
	playstyleButtons.forEach((button, index) => {
		button.addEventListener('click', () => renderPlaystyle(button.dataset.playstyle));
		button.addEventListener('keydown', (event) => {
			if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
			event.preventDefault();
			const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? playstyleButtons.length - 1 :
				(index + (event.key === 'ArrowRight' ? 1 : -1) + playstyleButtons.length) % playstyleButtons.length;
			playstyleButtons[nextIndex]?.focus();
			playstyleButtons[nextIndex]?.click();
		});
	});

	situationButtons.forEach((btn) => {
		btn.addEventListener('click', () => renderSituation(btn.dataset.situation));
	});

	renderFormation();
	renderPlaystyle(activePlaystyle);
	renderSituation('chasing');
};
setupTacticalBuilder();

const setupEloCalculator = () => {
	const currentInput = document.querySelector('#calc-user-rating');
	const opponentInput = document.querySelector('#calc-opponent-rating');
	const kFactorSelect = document.querySelector('#calc-k-factor');
	const presetSelect = document.querySelector('#calc-opponent-preset');
	const outcomeButtons = [...document.querySelectorAll('.calc-res-btn[data-outcome]')];
	const ratingPresetButtons = [...document.querySelectorAll('[data-calc-opponent-offset]')];
	const modeButtons = [...document.querySelectorAll('.calc-mode-btn[data-calc-mode]')];
	const deltaOutput = document.querySelector('#calc-delta');
	if (!currentInput || !opponentInput || !kFactorSelect || !deltaOutput) return;

	currentInput.value = String(window.LEAGUE_CONFIG.elo.initialRating);
	opponentInput.value = String(window.LEAGUE_CONFIG.elo.initialRating);
	let outcome = 'win';
	let selectedOpponentOffset = 0;
	let activeMode = 'single';
	let seriesSequence = ['win', 'win', 'win'];
	const outcomes = { win: 1, draw: 0.5, loss: 0 };
	const tierDescription = (tier) => `${tier.name} (${window.LEAGUE_CONFIG.formatTierRange(tier).replace(' rating', '')})`;
	const clampRating = (value) => Math.min(3000, Math.max(100, Math.round(value)));

	const seriesPresets = {
		'3-win': ['win', 'win', 'win'],
		'bo3-clinch': ['win', 'loss', 'win'],
		'5-streak': ['win', 'win', 'win', 'win', 'win'],
		'bounce': ['loss', 'win', 'win']
	};

	const renderSeriesChips = () => {
		const container = document.querySelector('#calc-series-chips');
		if (!container) return;
		container.replaceChildren();
		seriesSequence.forEach((res, index) => {
			const chip = document.createElement('button');
			chip.type = 'button';
			chip.className = `calc-series-chip is-${res}`;
			chip.textContent = `M${index + 1}: ${res.toUpperCase()}`;
			chip.title = 'Click to cycle Win -> Draw -> Loss';
			chip.addEventListener('click', () => {
				seriesSequence[index] = res === 'win' ? 'draw' : res === 'draw' ? 'loss' : 'win';
				renderSeriesChips();
				render();
			});
			container.append(chip);
		});
	};

	const render = () => {
		const current = Number(currentInput.value);
		const opponent = Number(opponentInput.value);
		const kFactor = Number(kFactorSelect.value);
		const validRatings = [current, opponent].every((rating) => Number.isInteger(rating) && rating >= 100 && rating <= 3000);
		if (!validRatings || !Number.isFinite(kFactor) || kFactor <= 0) {
			deltaOutput.textContent = '—';
			deltaOutput.classList.remove('positive', 'negative');
			return;
		}

		// Calculate 3-way stake matrix
		const winChange = window.LEAGUE_CONFIG.calculateEloChange(current, opponent, 1.0, kFactor);
		const drawChange = window.LEAGUE_CONFIG.calculateEloChange(current, opponent, 0.5, kFactor);
		const lossChange = window.LEAGUE_CONFIG.calculateEloChange(current, opponent, 0.0, kFactor);

		const setText = (selector, value) => {
			const el = document.querySelector(selector);
			if (el) el.textContent = value;
		};

		setText('#stake-win-delta', `${winChange > 0 ? '+' : ''}${winChange}`);
		setText('#stake-win-proj', `${Math.max(100, current + winChange).toLocaleString()} Elo`);
		setText('#stake-draw-delta', `${drawChange > 0 ? '+' : ''}${drawChange}`);
		setText('#stake-draw-proj', `${Math.max(100, current + drawChange).toLocaleString()} Elo`);
		setText('#stake-loss-delta', `${lossChange}`);
		setText('#stake-loss-proj', `${Math.max(100, current + lossChange).toLocaleString()} Elo`);

		// Standard single-match outcome projection
		const change = window.LEAGUE_CONFIG.calculateEloChange(current, opponent, outcomes[outcome], kFactor);
		const projected = Math.max(100, current + change);
		const tier = window.LEAGUE_CONFIG.getTier(projected);
		const nextTier = window.LEAGUE_CONFIG.tiers.find((item) => item.min > projected);
		const delta = projected - current;

		if (activeMode === 'single') {
			deltaOutput.textContent = `${delta > 0 ? '+' : ''}${delta}`;
			deltaOutput.classList.toggle('positive', delta >= 0);
			deltaOutput.classList.toggle('negative', delta < 0);
			deltaOutput.classList.remove('calc-delta-pop');
			window.requestAnimationFrame(() => deltaOutput.classList.add('calc-delta-pop'));
			setText('#calc-delta-headline', 'PROJECTED RATING CHANGE');
			setText('#calc-projected-rating', `New Rating: ${projected.toLocaleString()} Elo`);
		} else if (activeMode === 'series') {
			// Compute series trajectory step by step
			let runningRating = current;
			const steps = [];
			seriesSequence.forEach((res, i) => {
				const stepDelta = window.LEAGUE_CONFIG.calculateEloChange(runningRating, opponent, outcomes[res], kFactor);
				runningRating = Math.max(100, runningRating + stepDelta);
				steps.push({ match: i + 1, result: res, delta: stepDelta, rating: runningRating });
			});
			const netSeriesDelta = runningRating - current;
			deltaOutput.textContent = `${netSeriesDelta > 0 ? '+' : ''}${netSeriesDelta}`;
			deltaOutput.classList.toggle('positive', netSeriesDelta >= 0);
			deltaOutput.classList.toggle('negative', netSeriesDelta < 0);
			setText('#calc-delta-headline', `SERIES NET CHANGE (${seriesSequence.length} MATCHES)`);
			setText('#calc-projected-rating', `Series Final Rating: ${runningRating.toLocaleString()} Elo`);
			setText('#calc-trajectory-net', `${netSeriesDelta > 0 ? '+' : ''}${netSeriesDelta} Elo Net · Ending at ${runningRating.toLocaleString()}`);

			const trajectoryContainer = document.querySelector('#calc-trajectory-steps');
			if (trajectoryContainer) {
				trajectoryContainer.replaceChildren();
				steps.forEach((step) => {
					const stepEl = document.createElement('div');
					stepEl.className = `calc-step-pill is-${step.result}`;
					stepEl.innerHTML = `<span>M${step.match} (${step.result.toUpperCase()})</span><strong>${step.delta > 0 ? '+' : ''}${step.delta}</strong><small>${step.rating.toLocaleString()} Elo</small>`;
					trajectoryContainer.append(stepEl);
				});
			}
		}

		// Tier badge and meter
		const activeRating = activeMode === 'series'
			? Math.max(100, current + seriesSequence.reduce((acc, res) => acc + window.LEAGUE_CONFIG.calculateEloChange(current + acc, opponent, outcomes[res], kFactor), 0))
			: projected;
		const activeTier = window.LEAGUE_CONFIG.getTier(activeRating);
		const activeNextTier = window.LEAGUE_CONFIG.tiers.find((item) => item.min > activeRating);

		const badge = document.querySelector('#calc-tier-badge');
		if (badge) {
			badge.textContent = `${activeTier.name} Tier`;
			badge.className = `calc-tier-badge ${activeTier.className}`;
		}
		setText('#calc-tier-next', activeNextTier
			? `${Math.max(0, activeNextTier.min - activeRating)} pts to ${tierDescription(activeNextTier)}`
			: 'You are in the highest tier.');

		const tierStart = activeTier.min;
		const tierEnd = activeNextTier ? activeNextTier.min : Math.max(activeRating, tierStart + 1);
		const progress = activeNextTier
			? Math.min(100, Math.max(0, ((activeRating - tierStart) / (tierEnd - tierStart)) * 100))
			: 100;
		const meter = document.querySelector('#calc-tier-meter-fill');
		if (meter) meter.style.width = `${progress}%`;

		// Win expectation calculations
		const expectedScore = 1 / (1 + (10 ** ((opponent - current) / 400)));
		const expectedPercent = Math.round(expectedScore * 100);
		const opponentPercent = 100 - expectedPercent;

		setText('#calc-your-expectation', `${expectedPercent}%`);
		setText('#calc-opponent-expectation', `${opponentPercent}%`);
		setText('#calc-your-matchup-rating', `${current.toLocaleString()} Elo`);
		setText('#calc-opponent-matchup-rating', `${opponent.toLocaleString()} Elo`);

		const matchupReadout = document.querySelector('#calc-matchup-readout');
		const riskBadge = document.querySelector('#calc-risk-badge');
		if (matchupReadout) {
			const difference = current - opponent;
			matchupReadout.textContent = Math.abs(difference) < 25 ? 'EVEN MATCH' : difference > 0 ? 'YOU FAVOURED' : 'OPPONENT FAVOURED';
			matchupReadout.dataset.edge = Math.abs(difference) < 25 ? 'even' : difference > 0 ? 'you' : 'opponent';
		}
		if (riskBadge) {
			if (expectedScore >= 0.7) {
				riskBadge.textContent = 'High Risk / Defend Rating';
				riskBadge.className = 'calc-risk-badge risk-high';
			} else if (expectedScore <= 0.3) {
				riskBadge.textContent = 'High Reward Underdog';
				riskBadge.className = 'calc-risk-badge risk-reward';
			} else {
				riskBadge.textContent = 'Balanced Risk (50/50)';
				riskBadge.className = 'calc-risk-badge risk-balanced';
			}
		}

		const expectationFill = document.querySelector('#calc-expectation-fill');
		if (expectationFill) expectationFill.style.width = `${expectedPercent}%`;

		// Target Road to Next Tier Calculation
		const milestonesContainer = document.querySelector('#calc-target-milestones');
		if (milestonesContainer) {
			milestonesContainer.replaceChildren();
			window.LEAGUE_CONFIG.tiers.forEach((t) => {
				const pointsNeeded = t.min - current;
				const statusText = pointsNeeded <= 0 ? '✓ Achieved' : `${pointsNeeded} pts needed`;
				let winsEstimate = 0;
				if (pointsNeeded > 0) {
					let simR = current;
					while (simR < t.min && winsEstimate < 50) {
						const winGain = window.LEAGUE_CONFIG.calculateEloChange(simR, opponent, 1.0, kFactor);
						simR += Math.max(1, winGain);
						winsEstimate++;
					}
				}
				const row = document.createElement('div');
				row.className = `target-milestone-row ${pointsNeeded <= 0 ? 'is-complete' : ''}`;
				row.innerHTML = `
					<div><strong>${t.name} Tier (${t.min}+)</strong><small>${statusText}</small></div>
					<span>${pointsNeeded <= 0 ? 'Current' : `~${winsEstimate} ${winsEstimate === 1 ? 'win' : 'consecutive wins'}`}</span>
				`;
				milestonesContainer.append(row);
			});
		}

		// Insight text
		const insight = document.querySelector('#calc-insight-text');
		if (insight) {
			if (activeMode === 'series') {
				insight.textContent = `Series simulation shows the cumulative rating after ${seriesSequence.length} matches against ${opponent.toLocaleString()} Elo rival.`;
			} else {
				insight.textContent = outcome === 'win' && expectedScore < 0.5
					? `You are the underdog (${expectedPercent}% expected score). A win yields an impressive +${Math.max(0, delta)} Elo!`
					: `A ${outcome} projects to ${delta >= 0 ? '+' : ''}${delta} Elo at K=${kFactor} against a ${opponent.toLocaleString()} rated player.`;
			}
		}
	};

	const updateOpponentFromOffset = () => {
		if (selectedOpponentOffset === null) return;
		opponentInput.value = String(clampRating(Number(currentInput.value || window.LEAGUE_CONFIG.elo.initialRating) + selectedOpponentOffset));
		if (presetSelect) presetSelect.value = '';
	};

	currentInput.addEventListener('input', () => {
		updateOpponentFromOffset();
		render();
	});
	opponentInput.addEventListener('input', () => {
		selectedOpponentOffset = null;
		ratingPresetButtons.forEach((button) => button.classList.remove('is-active'));
		if (presetSelect) presetSelect.value = '';
		render();
	});
	kFactorSelect.addEventListener('change', render);

	ratingPresetButtons.forEach((button) => {
		button.addEventListener('click', () => {
			selectedOpponentOffset = Number(button.dataset.calcOpponentOffset);
			updateOpponentFromOffset();
			ratingPresetButtons.forEach((item) => item.classList.toggle('is-active', item === button));
			render();
		});
	});

	outcomeButtons.forEach((button) => {
		button.addEventListener('click', () => {
			outcome = button.dataset.outcome;
			outcomeButtons.forEach((item) => {
				const selected = item === button;
				item.classList.toggle('is-active', selected);
				item.setAttribute('aria-pressed', String(selected));
			});
			render();
		});
	});

	presetSelect?.addEventListener('change', () => {
		if (presetSelect.value) {
			selectedOpponentOffset = null;
			opponentInput.value = String(clampRating(Number(presetSelect.value)));
			ratingPresetButtons.forEach((button) => button.classList.remove('is-active'));
		}
		render();
	});

	// Mode switching: single / series / target
	modeButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			activeMode = btn.dataset.calcMode;
			modeButtons.forEach((b) => {
				const active = b === btn;
				b.classList.toggle('is-active', active);
				b.setAttribute('aria-selected', String(active));
			});
			const singleField = document.querySelector('#calc-single-outcome-field');
			const seriesControls = document.querySelector('#calc-series-controls');
			const trajectoryCard = document.querySelector('#calc-trajectory-card');
			const targetCard = document.querySelector('#calc-target-card');
			const stakeMatrix = document.querySelector('#calc-stake-matrix');

			if (singleField) singleField.hidden = activeMode !== 'single';
			if (seriesControls) seriesControls.hidden = activeMode !== 'series';
			if (trajectoryCard) trajectoryCard.hidden = activeMode !== 'series';
			if (targetCard) targetCard.hidden = activeMode !== 'target';
			if (stakeMatrix) stakeMatrix.hidden = activeMode === 'target';

			render();
		});
	});

	// Series presets
	document.querySelectorAll('.calc-series-btn[data-series]').forEach((btn) => {
		btn.addEventListener('click', () => {
			document.querySelectorAll('.calc-series-btn[data-series]').forEach((b) => b.classList.toggle('is-active', b === btn));
			seriesSequence = [...(seriesPresets[btn.dataset.series] || ['win', 'win', 'win'])];
			renderSeriesChips();
			render();
		});
	});

	// Share / Copy simulation
	const shareBtn = document.querySelector('#calc-share-btn');
	if (shareBtn) {
		shareBtn.addEventListener('click', async () => {
			const current = Number(currentInput.value);
			const opponent = Number(opponentInput.value);
			const k = Number(kFactorSelect.value);
			const winChange = window.LEAGUE_CONFIG.calculateEloChange(current, opponent, 1.0, k);
			const lossChange = window.LEAGUE_CONFIG.calculateEloChange(current, opponent, 0.0, k);
			const text = `🎮 Tim eFootball Elo Simulation:\nYour Rating: ${current.toLocaleString()} Elo | Opponent: ${opponent.toLocaleString()} Elo (K=${k})\n` +
				`• Win: ${winChange > 0 ? '+' : ''}${winChange} ➔ ${(current + winChange).toLocaleString()} Elo\n` +
				`• Loss: ${lossChange} ➔ ${(current + lossChange).toLocaleString()} Elo\n` +
				`Simulated on Tim eFootball League Hub.`;
			try {
				await navigator.clipboard.writeText(text);
				const prev = shareBtn.innerHTML;
				shareBtn.innerHTML = '<span>✓</span> Copied to Clipboard!';
				setTimeout(() => { shareBtn.innerHTML = prev; }, 2000);
			} catch {
				alert(text);
			}
		});
	}

	renderSeriesChips();
	render();

	Promise.all([
		fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' }).then(async (response) => response.ok ? response.json() : null),
		fetch('/api/rankings/live', { cache: 'no-store' }).then(async (response) => response.ok ? response.json() : null)
	]).then(([profile, rankingData]) => {
		if (profile?.authenticated && Number.isFinite(Number(profile.rating))) {
			currentInput.value = String(profile.rating);
			updateOpponentFromOffset();
		}
		if (presetSelect && Array.isArray(rankingData?.players)) {
			rankingData.players.forEach((player) => {
				const option = document.createElement('option');
				option.value = String(player.rating);
				option.textContent = `${player.gamerTag} · ${Number(player.rating).toLocaleString()} Elo`;
				presetSelect.append(option);
			});
		}
		render();
	}).catch(() => {
		const hint = document.querySelector('#calc-user-rating')?.closest('.calc-field')?.querySelector('.field-hint');
		if (hint) hint.textContent = 'Enter your current rating or sign in to load your profile rating.';
	});
};
setupEloCalculator();

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
		description: 'I’m Kicki, your league guide. Create a player account to enter events, set up matches, and keep your results together.',
		links: [
			{ label: 'Create your account', href: 'signup.html', icon: '↗' },
			{ label: 'Already a player? Sign in', href: 'login.html', icon: '↗' }
		]
	},
	{
		kicker: 'YOUR DASHBOARD · 02 / 04',
		title: 'This is your home base.',
		description: 'Your dashboard brings together verified player records, approved results, and administrator-published events.',
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
		description: 'The Match Centre shows approved results and verified player challenges. Rankings displays verified player records.',
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

	const mascot = document.querySelector('#onboarding-mascot');
	const speechMark = document.querySelector('.mascot-speech-mark');
	if (mascot) {
		mascot.dataset.step = String(activeOnboardingStep + 1);
		mascot.classList.remove('mascot-step-react');
		window.requestAnimationFrame(() => mascot.classList.add('mascot-step-react'));
	}
	if (speechMark) speechMark.textContent = activeOnboardingStep === onboardingSteps.length - 1 ? '✓' : String(activeOnboardingStep + 1);

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
	onboardingHelp?.setAttribute('aria-expanded', 'true');
	onboardingNext?.focus();
};

const finishOnboarding = () => {
	if (!onboardingDialog) return;
	try {
		localStorage.setItem(ONBOARDING_KEY, 'true');
	} catch {
		// Storage can be unavailable in privacy modes.
	}
	if (onboardingDialog.open) onboardingDialog.close();
	onboardingHelp?.setAttribute('aria-expanded', 'false');
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
	try {
		if (!localStorage.getItem(ONBOARDING_KEY) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
			window.setTimeout(openOnboarding, 900);
		}
	} catch {
		window.setTimeout(openOnboarding, 900);
	}
}

const guideTips = {
	'tournaments.html': {
		message: 'Compare the open events, check each event’s rules, then choose one that fits your schedule.',
		label: 'Explore open events',
		href: '#tournament-grid-section'
	},
	'matches.html': {
		message: 'Choose a player in the directory to send a match challenge. Use the Match Centre to follow updates and report your score.',
		label: 'Start in the player directory',
		href: '#player-directory'
	},
	'cup.html': {
		message: 'Check the published format and bracket first. The organiser’s event details explain eligibility and registration.',
		label: 'See the Cup details',
		href: '#cup-title'
	},
	'rankings.html': {
		message: 'Search and sort verified player records. Approved ranked results determine ratings and standings.',
		label: 'Browse player standings',
		href: '#players-panel'
	},
	'play.html': {
		message: 'Start with the readiness checklist, then explore the tactics tools and match rules.',
		label: 'Get started',
		href: '#get-started'
	},
	'profile.html': {
		message: 'Keep your gamer tag and platform details current here. Your verified results and rating are saved to your profile.',
		label: 'Open your profile',
		href: '#profile-shell'
	},
	'login.html': {
		message: 'Sign in with the email you verified when you created your player account.',
		label: 'Go to sign in',
		href: '#signin-email'
	},
	'signup.html': {
		message: 'Create your player profile, then verify your email before signing in.',
		label: 'Create your player profile',
		href: '#signup-form'
	}
};

const guidePath = location.pathname.split('/').pop() || 'index.html';
let guideButton = onboardingHelp;
if (!guideButton) {
	guideButton = document.createElement('button');
	guideButton.className = 'onboarding-help-button';
	guideButton.id = 'onboarding-help';
	guideButton.type = 'button';
	guideButton.setAttribute('aria-controls', 'guide-tip');
	guideButton.setAttribute('aria-expanded', 'false');
	guideButton.innerHTML = '<span class="onboarding-help-icon"><img src="favicon.png" alt=""></span><span>Ask Kicki</span>';
	document.body.append(guideButton);
}
guideButton.setAttribute('aria-haspopup', onboardingDialog ? 'dialog' : 'true');
guideButton.setAttribute('aria-controls', onboardingDialog ? 'onboarding-dialog' : 'guide-tip');
guideButton.setAttribute('aria-expanded', 'false');

const guideTip = document.createElement('aside');
guideTip.className = 'guide-tip';
guideTip.id = 'guide-tip';
guideTip.setAttribute('aria-label', 'Kicki’s page tip');
guideTip.hidden = true;
const guideTipHeader = document.createElement('div');
guideTipHeader.className = 'guide-tip-header';
const guideTipIdentity = document.createElement('span');
guideTipIdentity.className = 'guide-tip-identity';
const guideTipLogo = document.createElement('img');
guideTipLogo.src = 'favicon.png';
guideTipLogo.alt = '';
const guideTipName = document.createElement('strong');
guideTipName.textContent = 'KICKI’S QUICK TIP';
guideTipIdentity.append(guideTipLogo, guideTipName);
const guideTipClose = document.createElement('button');
guideTipClose.className = 'guide-tip-close';
guideTipClose.type = 'button';
guideTipClose.setAttribute('aria-label', 'Close Kicki’s tip');
guideTipClose.textContent = '×';
guideTipHeader.append(guideTipIdentity, guideTipClose);
const guideTipMessage = document.createElement('p');
guideTipMessage.className = 'guide-tip-message';
const guideTipAction = document.createElement('a');
guideTipAction.className = 'guide-tip-action';
guideTip.append(guideTipHeader, guideTipMessage, guideTipAction);
document.body.append(guideTip);

const guideTipContent = guideTips[guidePath] || {
	message: 'Use the league navigation to find tournaments, matches, rankings, and player information.',
	label: 'Explore the league',
	href: 'index.html'
};
guideTipMessage.textContent = guideTipContent.message;
guideTipAction.textContent = guideTipContent.label;
guideTipAction.href = guideTipContent.href;

const setGuideTipOpen = (isOpen) => {
	guideTip.hidden = !isOpen;
	guideButton.setAttribute('aria-expanded', String(isOpen));
	if (isOpen) {
		try {
			localStorage.setItem(`timLeagueTip:${guidePath}`, 'seen');
		} catch {
			// Tips are still available from the guide button without storage.
		}
	}
};
if (!onboardingDialog) {
	guideButton.addEventListener('click', () => setGuideTipOpen(guideTip.hidden));
}
guideTipClose.addEventListener('click', () => {
	setGuideTipOpen(false);
	guideButton.focus();
});
guideTipAction.addEventListener('click', () => {
	try {
		localStorage.setItem(`timLeagueTip:${guidePath}`, 'seen');
	} catch {
		// The guide link remains usable when browser storage is unavailable.
	}
	setGuideTipOpen(false);
});
document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape' && !guideTip.hidden) {
		setGuideTipOpen(false);
		guideButton.focus();
	}
});
try {
	if (guidePath !== 'index.html' && !localStorage.getItem(`timLeagueTip:${guidePath}`) &&
		!matchMedia('(prefers-reduced-motion: reduce)').matches) {
		window.setTimeout(() => setGuideTipOpen(true), 6000);
	}
} catch {
	if (guidePath !== 'index.html') window.setTimeout(() => setGuideTipOpen(true), 6000);
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
	window.LEAGUE_CONFIG.tiers.forEach((tier) => {
		if ([...rankingDivision.options].some((option) => option.value === tier.id)) return;
		const option = document.createElement('option');
		option.value = tier.id;
		option.textContent = tier.name;
		rankingDivision.append(option);
	});

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
	const reduceRankingMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const animateRankingValue = (element, value, suffix = '') => {
		const target = Number(value);
		const format = (number) => `${number.toLocaleString()}${suffix}`;
		if (!Number.isFinite(target)) {
			element.textContent = '—';
			return;
		}
		if (reduceRankingMotion) {
			element.textContent = format(target);
			return;
		}

		const start = window.performance.now();
		const duration = 850;
		const update = (now) => {
			const progress = Math.min((now - start) / duration, 1);
			const eased = 1 - Math.pow(1 - progress, 3);
			element.textContent = format(Math.round(target * eased));
			if (progress < 1) window.requestAnimationFrame(update);
		};
		window.requestAnimationFrame(update);
	};

	const updateLeaderboard = () => {
		const body = rankingBodies[activeRankingView];
		if (!body) return;

		const query = rankingSearch.value.trim().toLocaleLowerCase();
		const division = rankingDivision.value;
		const rows = [...body.querySelectorAll('tr:not([data-message])')];
		const visibleRows = rows.filter((row) => {
			const matchesSearch = (row.dataset.name || '').includes(query);
			const matchesDivision = division === 'all' || row.dataset.division === division;
			row.hidden = !matchesSearch || !matchesDivision;
			return !row.hidden;
		});
		const hasRankedProfiles = body.querySelectorAll('tr[data-name]').length > 0;

		const sortKey = rankingSort.value;
		if (sortKey !== 'default') {
			visibleRows.sort((a, b) => Number(b.dataset[sortKey]) - Number(a.dataset[sortKey]));
		} else {
			visibleRows.sort((a, b) => rankingOrder.get(body).get(a) - rankingOrder.get(body).get(b));
		}

		visibleRows.forEach((row) => body.append(row));
		rankingCount.textContent = `Showing ${visibleRows.length} ${activeRankingView === 'players' ? 'players' : 'clubs'}`;
		leaderboardEmpty.textContent = hasRankedProfiles
			? 'No rankings match those filters. Try another name or division.'
			: 'No verified player records yet.';
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
			updateLeaderboard();
		});
	});

	rankingSearch.addEventListener('input', updateLeaderboard);
	rankingDivision.addEventListener('change', updateLeaderboard);
	rankingSort.addEventListener('change', updateLeaderboard);
	if (rankingBodies.players) {
		const note = document.querySelector('#rank-data-note');
		const retryButton = document.querySelector('#rankings-retry');
		const body = rankingBodies.players;
		const loadRankings = async () => {
			retryButton.hidden = true;
			if (note) note.textContent = 'Loading verified player records…';
			body.replaceChildren();
			const loading = document.createElement('tr');
			const loadingCell = document.createElement('td');
			loadingCell.colSpan = 5;
			loadingCell.textContent = 'Loading verified player records…';
			loading.append(loadingCell);
			body.append(loading);
			const wakeTimer = window.setTimeout(() => {
				if (note) note.textContent = 'The server is waking up. Rankings will appear as soon as it responds…';
			}, 8000);
			try {
				const response = await fetch('/api/rankings/live', { credentials: 'same-origin', cache: 'no-store' });
				const result = await response.json().catch(() => ({}));
				if (!response.ok) throw new Error(result.message || 'Live player rankings are temporarily unavailable.');
				body.replaceChildren();
				const players = result.players || [];
				if (!players.length) {
					const row = document.createElement('tr');
					row.dataset.message = 'empty';
					const cell = document.createElement('td');
					cell.colSpan = 5;
					cell.textContent = 'No verified player records yet.';
					row.append(cell);
					body.append(row);
				}
				players.forEach((player) => {
					const row = document.createElement('tr');
					const ratedMatches = Number(player.rankedMatches) || 0;
					const wins = Number(player.wins) || 0;
					const draws = Number(player.draws) || 0;
					const losses = Number(player.losses) || 0;
					const ratingValue = Number(player.rating) || 1000;
					const total = wins + draws + losses;
					const winRate = total ? Math.round((wins / total) * 100) : 0;
					const tier = window.LEAGUE_CONFIG.getTier(ratingValue);
					row.className = 'ranking-row-enter';
					row.style.animationDelay = `${Math.min(player.rank - 1, 8) * 45}ms`;
					Object.assign(row.dataset, {
						name: player.gamerTag.toLocaleLowerCase(),
						division: tier.id,
						rating: String(ratingValue),
						wins: String(wins),
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
					if (player.avatarUrl) {
						const image = document.createElement('img');
						image.src = player.avatarUrl;
						image.alt = '';
						image.loading = 'lazy';
						image.onerror = () => { image.remove(); avatar.textContent = player.gamerTag.slice(0, 1).toUpperCase(); };
						avatar.append(image);
					} else avatar.textContent = player.gamerTag.slice(0, 1).toUpperCase();
					const identity = document.createElement('span');
					const name = document.createElement('strong');
					name.textContent = player.gamerTag;
					const detail = document.createElement('small');
					detail.textContent = ratedMatches ? `${ratedMatches} owner-approved ranked matches` : 'No approved ranked matches yet';
					identity.append(name, detail);
					playerLabel.append(avatar, identity);
					playerCell.append(playerLabel);
					const ratingCell = document.createElement('td');
					const ratingPlate = document.createElement('span');
					ratingPlate.className = `rating-plate rating-${tier.id}`;
					const rating = document.createElement('strong');
					rating.className = 'rating-value';
					const ratingTier = document.createElement('small');
					ratingTier.className = 'rating-tier-label';
					ratingTier.textContent = tier.name;
					ratingPlate.append(rating, ratingTier);
					ratingCell.append(ratingPlate);
					animateRankingValue(rating, ratingValue);
					const recordCell = document.createElement('td');
					const record = document.createElement('span');
					record.className = 'record-metrics';
					record.setAttribute('aria-label', `${wins} wins, ${draws} draws, ${losses} losses`);
					[
						['W', wins, 'record-win'],
						['D', draws, 'record-draw'],
						['L', losses, 'record-loss']
					].forEach(([label, value, className]) => {
						const metric = document.createElement('span');
						metric.className = `record-metric ${className}`;
						const metricLabel = document.createElement('small');
						metricLabel.textContent = label;
						const metricValue = document.createElement('strong');
						metricValue.className = 'record-count';
						metric.append(metricLabel, metricValue);
						record.append(metric);
						animateRankingValue(metricValue, value);
					});
					recordCell.append(record);
					const matchesCell = document.createElement('td');
					const matchesValue = document.createElement('strong');
					matchesValue.className = 'ranked-match-count';
					matchesCell.append(matchesValue);
					animateRankingValue(matchesValue, ratedMatches);
					row.append(rankCell, playerCell, ratingCell, recordCell, matchesCell);
					body.append(row);
					rankingOrder.get(body).set(row, player.rank);
				});
				const totalRankedMatches = players.reduce((total, player) => total + (Number(player.rankedMatches) || 0), 0);
				const topPlayer = players[0];
				const setText = (selector, value) => {
					const element = document.querySelector(selector);
					if (element) element.textContent = value;
				};
				setText('#rank-top-player', topPlayer?.gamerTag || 'No players');
				const topRating = document.querySelector('#rank-top-rating');
				if (topRating) {
					if (topPlayer) animateRankingValue(topRating, Number(topPlayer.rating) || 1000, ' Elo');
					else topRating.textContent = '— Elo';
				}
				setText('#rank-top-position', topPlayer ? '#01' : '—');
				const playerTotal = document.querySelector('#rank-player-total');
				const matchTotal = document.querySelector('#rank-match-total');
				if (playerTotal) animateRankingValue(playerTotal, players.length);
				if (matchTotal) animateRankingValue(matchTotal, Math.floor(totalRankedMatches / 2));
				if (note) note.textContent = `Live verified-player database standings · ${result.ratingSystem} Administrators and explicitly demo-marked profiles are excluded. Only approved ranked results affect ratings and records.`;
				updateLeaderboard();
			} catch (error) {
				body.replaceChildren();
				const row = document.createElement('tr');
				row.dataset.message = 'error';
				const cell = document.createElement('td');
				cell.colSpan = 5;
				cell.textContent = error.message;
				row.append(cell);
				body.append(row);
				if (note) note.textContent = `Live player standings could not be loaded: ${error.message}`;
				rankingCount.textContent = 'Live player rankings unavailable';
				leaderboardEmpty.hidden = true;
				retryButton.hidden = false;
			} finally {
				window.clearTimeout(wakeTimer);
			}
		};
		retryButton?.addEventListener('click', loadRankings);
		loadRankings();
	}
	updateLeaderboard();
}

const rankedClubsGrid = document.querySelector('#ranked-clubs-grid');
if (rankedClubsGrid) {
	const status = document.querySelector('#club-standings-status');
	const retry = document.querySelector('#club-standings-retry');
	const renderClubs = (clubs) => {
		rankedClubsGrid.replaceChildren();
		if (!clubs.length) {
			const empty = document.createElement('p');
			empty.className = 'club-record-empty';
			empty.textContent = 'No verified players have been assigned to a club yet. Administrators can assign a club in the player editor.';
			rankedClubsGrid.append(empty);
			return;
		}
		clubs.forEach((club) => {
			const card = document.createElement('article');
			card.className = 'club-record-card';
			const header = document.createElement('div');
			header.className = 'club-record-header';
			const rank = document.createElement('span');
			rank.className = 'club-record-rank';
			rank.textContent = `#${String(club.rank).padStart(2, '0')}`;
			const members = document.createElement('span');
			members.className = 'club-record-members';
			members.textContent = `${club.members} verified player${club.members === 1 ? '' : 's'}`;
			header.append(rank, members);
			const name = document.createElement('h3');
			name.textContent = club.name;
			const stats = document.createElement('div');
			stats.className = 'club-record-stats';
			[
				['Average Elo', Number(club.averageRating || 0).toLocaleString()],
				['Member record', club.record || '0–0–0']
			].forEach(([label, value]) => {
				const item = document.createElement('span');
				const strong = document.createElement('strong');
				strong.textContent = value;
				const caption = document.createElement('small');
				caption.textContent = label;
				item.append(strong, caption);
				stats.append(item);
			});
			const roster = document.createElement('p');
			roster.className = 'club-record-player-list';
			roster.textContent = club.players.join(' · ');
			card.append(header, name, stats, roster);
			rankedClubsGrid.append(card);
		});
	};
	const loadClubs = async () => {
		retry.hidden = true;
		status.textContent = 'Loading verified club records…';
		const wakeTimer = window.setTimeout(() => {
			status.textContent = 'The server is waking up. Club records will appear shortly…';
		}, 8000);
		try {
			const response = await fetch('/api/site/clubs', { cache: 'no-store' });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.message || 'Club records could not be loaded.');
			renderClubs(data.clubs || []);
			status.textContent = 'Club standings are calculated from verified members’ saved Elo and records.';
		} catch (error) {
			status.textContent = `Club records could not be loaded: ${error.message}`;
			rankedClubsGrid.replaceChildren();
			const failure = document.createElement('p');
			failure.className = 'club-record-empty';
			failure.textContent = 'The club standings are temporarily unavailable. Retry to try again.';
			rankedClubsGrid.append(failure);
			retry.hidden = false;
		} finally {
			window.clearTimeout(wakeTimer);
		}
	};
	retry?.addEventListener('click', loadClubs);
	loadClubs();
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
	const matchSearch = document.querySelector('#match-search');
	const matchFilters = [...document.querySelectorAll('[data-match-filter]')];
	const matchSort = document.querySelector('#match-sort');
	const matchCount = document.querySelector('#match-count');
	const matchesEmpty = document.querySelector('#matches-empty');
	const matchesEmptyTitle = document.querySelector('#matches-empty-title');
	const matchesEmptyCopy = document.querySelector('#matches-empty-copy');
	const matchesDataNote = document.querySelector('#matches-data-note');
	const retryMatchesButton = document.querySelector('#matches-retry');
	let resultCards = [];

	const updateMatchList = () => {
		const query = matchSearch?.value.trim().toLocaleLowerCase() || '';
		const visibleCards = resultCards.filter((card) => (card.dataset.search || '').includes(query));
		if (matchSort?.value === 'oldest') visibleCards.reverse();
		visibleCards.forEach((card) => matchesList.append(card));
		if (matchCount) matchCount.textContent = 'Showing ' + visibleCards.length + ' approved result' + (visibleCards.length === 1 ? '' : 's');
		if (matchesEmpty) matchesEmpty.hidden = visibleCards.length > 0;
		if (!visibleCards.length && matchesEmptyTitle && matchesEmptyCopy) {
			matchesEmptyTitle.textContent = resultCards.length ? 'No results match your search.' : 'No approved results yet.';
			matchesEmptyCopy.textContent = resultCards.length ? 'Try another player or event name.' : 'Approved results will appear here after they are saved to player records.';
		}
	};

	const makeResultCard = (match) => {
		const article = document.createElement('article');
		article.className = 'match-list-card result-match';
		article.dataset.matchId = match.id;
		article.dataset.status = 'results';
		article.dataset.competition = match.competition || 'open';
		article.dataset.date = match.approvedAt || '';
		article.dataset.search = [match.challenger, match.opponent, match.competition].join(' ').toLocaleLowerCase();
		const date = new Date(match.approvedAt);
		const dateLabel = Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { weekday: 'short', day: '2-digit', month: 'short' }).format(date);
		const timeLabel = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
		const dateParts = dateLabel.split(' ');
		const dateBlock = document.createElement('div');
		dateBlock.className = 'match-list-date result-date';
		[dateParts[0] || '', dateParts[1] || '', [dateParts[2], timeLabel].filter(Boolean).join(' at ')].forEach((value, index) => {
			const element = document.createElement(index === 1 ? 'strong' : 'span');
			element.textContent = value;
			dateBlock.append(element);
		});
		const main = document.createElement('div');
		main.className = 'match-list-main';
		const meta = document.createElement('div');
		meta.className = 'match-list-meta';
		const event = document.createElement('span');
		event.className = 'match-competition-tag';
		event.textContent = String(match.competition || 'League').replace(/[-_]/g, ' ').toUpperCase();
		const approved = document.createElement('span');
		approved.className = 'match-result-tag';
		approved.textContent = 'APPROVED';
		meta.append(event, approved);
		const teams = document.createElement('div');
		teams.className = 'match-list-teams result-teams';
		const createPlayer = (name, badgeClass, avatarUrl) => {
			const player = document.createElement('div');
			player.className = 'match-list-team';
			const badge = document.createElement('span');
			badge.className = 'matches-team-badge ' + badgeClass;
			if (avatarUrl) {
				const image = document.createElement('img');
				image.src = avatarUrl;
				image.alt = '';
				image.loading = 'lazy';
				image.onerror = () => { image.remove(); badge.textContent = (name || 'P').slice(0, 2).toUpperCase(); };
				badge.append(image);
			} else badge.textContent = (name || 'P').slice(0, 2).toUpperCase();
			const tag = document.createElement('strong');
			tag.textContent = name || 'Player';
			player.append(badge, tag);
			return player;
		};
		const score = document.createElement('span');
		score.className = 'match-score';
		const scoreOne = document.createElement('b');
		scoreOne.textContent = String(match.challengerScore);
		const divider = document.createElement('i');
		divider.textContent = '-';
		const scoreTwo = document.createElement('b');
		scoreTwo.textContent = String(match.opponentScore);
		score.append(scoreOne, divider, scoreTwo);
		const opponent = createPlayer(match.opponent, 'blue-badge', match.opponentAvatarUrl);
		opponent.classList.add('away-team');
		teams.append(createPlayer(match.challenger, 'gold-badge', match.challengerAvatarUrl), score, opponent);
		main.append(meta, teams);
		const verified = document.createElement('span');
		verified.className = 'result-verified-label';
		verified.textContent = 'Approved';
		article.append(dateBlock, main, verified);
		return article;
	};

	const loadMatchResults = async () => {
		if (retryMatchesButton) retryMatchesButton.hidden = true;
		if (matchesDataNote) matchesDataNote.textContent = 'Loading approved player results...';
		matchesList.replaceChildren();
		const wakeTimer = window.setTimeout(() => {
			if (matchesDataNote) matchesDataNote.textContent = 'The server is waking up. Approved results will appear as soon as it responds...';
		}, 8000);
		try {
			const response = await fetch('/api/site/dashboard', { credentials: 'same-origin', cache: 'no-store' });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.message || 'Approved results could not be loaded.');
			resultCards = (data.recentResults || []).map(makeResultCard);
			resultCards.forEach((card) => matchesList.append(card));
			if (matchesDataNote) matchesDataNote.textContent = 'Only approved results from player records are shown.';
			const setText = (selector, value) => {
				const element = document.querySelector(selector);
				if (element) element.textContent = value;
			};
			setText('#matches-player-count', Number(data.stats?.players || 0).toLocaleString());
			setText('#matches-result-count', Number(data.stats?.approvedMatches || 0).toLocaleString());
			setText('#matches-event-count', Number(data.stats?.activeEvents || 0).toLocaleString());
			const firstResult = data.recentResults?.[0];
			if (firstResult) {
				setText('#featured-result-title', 'Approved score');
				setText('#featured-result-competition', String(firstResult.competition || 'League').replace(/[-_]/g, ' '));
				setText('#featured-result-player-one', firstResult.challenger);
				setText('#featured-result-player-two', firstResult.opponent);
				const approvedDate = new Date(firstResult.approvedAt);
				setText('#featured-result-date', Number.isNaN(approvedDate.getTime()) ? 'Approval date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(approvedDate));
				const score = document.createElement('span');
				score.className = 'matches-versus';
				score.textContent = String(firstResult.challengerScore) + ' - ' + String(firstResult.opponentScore);
				const makeFeaturedPlayer = (name, badgeClass, side, avatarUrl) => {
					const player = document.createElement('div');
					const badge = document.createElement('span');
					badge.className = 'matches-team-badge ' + badgeClass;
					if (avatarUrl) {
						const image = document.createElement('img');
						image.src = avatarUrl;
						image.alt = '';
						image.onerror = () => { image.remove(); badge.textContent = (name || 'P').slice(0, 2).toUpperCase(); };
						badge.append(image);
					} else badge.textContent = (name || 'P').slice(0, 2).toUpperCase();
					const tag = document.createElement('strong');
					tag.textContent = name || 'Player';
					const label = document.createElement('small');
					label.textContent = side;
					player.append(badge, tag, label);
					return player;
				};
				const featuredMatchTitle = document.querySelector('#featured-match-title');
				if (featuredMatchTitle) {
					featuredMatchTitle.hidden = false;
					featuredMatchTitle.replaceChildren(
						makeFeaturedPlayer(firstResult.challenger, 'gold-badge', 'Home', firstResult.challengerAvatarUrl),
						score,
						makeFeaturedPlayer(firstResult.opponent, 'blue-badge', 'Away', firstResult.opponentAvatarUrl)
					);
				}
			}
			updateMatchList();
		} catch (error) {
			if (matchesDataNote) matchesDataNote.textContent = 'Results could not be loaded: ' + error.message;
			if (retryMatchesButton) retryMatchesButton.hidden = false;
			if (matchesEmptyTitle) matchesEmptyTitle.textContent = 'Unable to load results.';
			if (matchesEmptyCopy) matchesEmptyCopy.textContent = error.message;
			if (matchesEmpty) matchesEmpty.hidden = false;
		} finally {
			window.clearTimeout(wakeTimer);
		}
	};

	matchSearch?.addEventListener('input', updateMatchList);
	matchSort?.addEventListener('change', updateMatchList);
	matchFilters.forEach((filter) => filter.addEventListener('click', () => {
		matchFilters.forEach((item) => {
			const selected = item === filter;
			item.classList.toggle('is-selected', selected);
			item.setAttribute('aria-pressed', String(selected));
		});
		updateMatchList();
	}));
	document.querySelector('#reset-match-filters')?.addEventListener('click', () => {
		if (matchSearch) matchSearch.value = '';
		updateMatchList();
		matchSearch?.focus();
	});
	retryMatchesButton?.addEventListener('click', loadMatchResults);
	loadMatchResults();
}

const challengeStatusMessage = document.querySelector('#challenge-status-message');
const challengeSignInDestination = 'login.html?next=matches.html%23challenges';
const matchAccessStorageKey = 'timLeaguePrivateMatchLinks';
const ownerAccessStorageKey = 'timLeagueOwnerReviewLink';
let directoryPlayers = [];
let currentUserAuthenticated = false;
let currentUserId = '';

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
const chatPollers = new Map();
const loadPublicStreams = async () => {
	const list = document.querySelector('#public-stream-list');
	const status = document.querySelector('#live-stream-status');
	const retry = document.querySelector('#live-streams-retry');
	if (!list || !status) return;
	retry.hidden = true;
	status.textContent = 'Loading player-submitted streams...';
	const wakeTimer = window.setTimeout(() => {
		status.textContent = 'The match server is waking up. Public streams will appear as soon as it responds.';
	}, 8000);
	try {
		const result = await matchApi('/api/site/live-streams');
		list.replaceChildren();
		if (!result.streams.length) {
			list.append(makeMatchElement('p', 'challenge-list-empty', 'No accepted matches have public stream links right now.'));
			status.textContent = 'No public streams available.';
			return;
		}
		result.streams.forEach((stream) => {
			const card = makeMatchElement('article', 'public-stream-card');
			card.append(makeMatchElement('h3', '', `${stream.challenger.gamerTag} vs ${stream.opponent.gamerTag}`));
			card.append(makeMatchElement('p', 'public-stream-time', `${formatChallengeTime(stream.scheduledAt)} · your local time`));
			const link = makeMatchElement('a', 'challenge-primary-button public-stream-link', 'Watch player stream');
			link.href = stream.streamUrl;
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
			card.append(link);
			list.append(card);
		});
		status.textContent = `${result.streams.length} public stream${result.streams.length === 1 ? '' : 's'} available.`;
	} catch (error) {
		list.replaceChildren(makeMatchElement('p', 'challenge-list-empty', 'Could not load public streams. Check the connection and retry.'));
		status.textContent = error.message;
		retry.hidden = false;
	} finally {
		window.clearTimeout(wakeTimer);
	}
};
const challengeStatusText = (status, match = null) => {
	if (status === 'pending') {
		return match?.isChallenger ? 'Invitation sent · awaiting response' : 'Invitation received · response needed';
	}
	return ({
		accepted: 'Accepted · scheduled',
		'awaiting-opponent': 'Score submitted · awaiting opponent',
		disputed: 'Reports differ · admin review',
		'pending-owner': 'Reports received · admin review',
		approved: 'Result approved',
		rejected: 'Result needs clarification',
		declined: 'Invitation declined',
		cancelled: 'Invitation cancelled'
	}[status] || 'Match update');
};

const playerRatingBand = (rating) => {
	const tier = window.LEAGUE_CONFIG.getTier(rating);
	return { key: tier.id, label: tier.name, className: tier.className };
};

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
		directory.append(makeMatchElement('div', 'player-directory-empty', directoryPlayers.length
			? 'No players match these filters. Try another rating or experience level, or reset your filters.'
			: 'No player profiles with a linked email are saved yet. Add players to the website’s player registry before sending invitations.'));
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
		if (player.avatarUrl) {
			avatar.textContent = '';
			const image = document.createElement('img');
			image.src = player.avatarUrl;
			image.alt = '';
			image.loading = 'lazy';
			image.onerror = () => { image.remove(); avatar.textContent = player.gamerTag.slice(0, 1).toLocaleUpperCase(); };
			avatar.append(image);
		}
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
		const challengeButton = makeMatchElement('button', 'challenge-primary-button player-challenge-button', currentUserAuthenticated ? 'Challenge player' : 'Sign in to challenge');
		challengeButton.type = 'button';
		challengeButton.dataset.challengePlayer = player.id;
		challengeButton.disabled = directoryPlayers.length === 0;
		if (challengeButton.disabled) challengeButton.title = 'There are no other verified player profiles to challenge yet.';
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
	const scorelinePreview = makeMatchElement('p', 'scoreline-preview', 'Enter both scores to preview your result.');
	scorelinePreview.setAttribute('aria-live', 'polite');
	const updateScorelinePreview = () => {
		const yourScore = form.elements.yourScore.value;
		const opponentScore = form.elements.opponentScore.value;
		if (yourScore === '' || opponentScore === '') {
			scorelinePreview.textContent = 'Enter both scores to preview your result.';
			scorelinePreview.dataset.outcome = '';
			return;
		}
		const outcome = Number(yourScore) > Number(opponentScore) ? 'WIN' : Number(yourScore) < Number(opponentScore) ? 'LOSS' : 'DRAW';
		scorelinePreview.textContent = `Your report: ${yourScore}–${opponentScore} · ${outcome}`;
		scorelinePreview.dataset.outcome = outcome.toLowerCase();
	};
	form.elements.yourScore.addEventListener('input', updateScorelinePreview);
	form.elements.opponentScore.addEventListener('input', updateScorelinePreview);
	form.append(scorelinePreview);
	const evidenceLabel = makeMatchElement('label', 'match-evidence-field', 'Scoreline screenshot (PNG, JPEG or WebP · max 5 MB)');
	const evidence = document.createElement('input');
	evidence.name = 'evidence';
	evidence.type = 'file';
	evidence.accept = 'image/png,image/jpeg,image/webp';
	evidence.required = true;
	evidenceLabel.append(evidence);
	const evidencePreview = makeMatchElement('div', 'match-evidence-preview');
	evidencePreview.hidden = true;
	evidence.addEventListener('change', () => {
		const file = evidence.files?.[0];
		if (!file) {
			evidencePreview.hidden = true;
			evidencePreview.replaceChildren();
			return;
		}
		if (file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
			evidence.value = '';
			evidencePreview.hidden = true;
			matchMessage(challengeStatusMessage, 'Choose a PNG, JPEG or WebP screenshot smaller than 5 MB.', true);
			return;
		}
		const preview = document.createElement('img');
		preview.alt = 'Selected match score screenshot preview';
		preview.src = URL.createObjectURL(file);
		evidencePreview.replaceChildren(preview, makeMatchElement('span', '', 'Screenshot ready to submit'));
		evidencePreview.hidden = false;
	});
	const submit = makeMatchElement('button', 'challenge-secondary-button challenge-report-button', match.result ? 'Resubmit score & screenshot' : 'Submit score & screenshot');
	submit.type = 'submit';
	form.append(evidenceLabel, evidencePreview, submit);
	return form;
};

const makePlayerReportForm = (match) => {
	const details = makeMatchElement('details', 'player-report-details');
	details.append(makeMatchElement('summary', '', 'Report a problem with this player'));
	const form = makeMatchElement('form', 'player-report-form');
	form.dataset.matchId = match.id;
	const reason = document.createElement('select');
	reason.name = 'reason';
	reason.required = true;
	[
		['', 'Choose a reason'],
		['no-show', 'Repeated no-show'],
		['inappropriate', 'Inappropriate conduct'],
		['score-pressure', 'Pressure to submit a false score'],
		['other', 'Other match conduct']
	].forEach(([value, label]) => {
		const option = document.createElement('option');
		option.value = value;
		option.textContent = label;
		reason.append(option);
	});
	const reasonLabel = makeMatchElement('label', '', 'Reason');
	reasonLabel.append(reason);
	const detailsLabel = makeMatchElement('label', '', 'Details (optional)');
	const notes = document.createElement('textarea');
	notes.name = 'details';
	notes.maxLength = 1000;
	notes.placeholder = 'Share relevant facts about this match (up to 1,000 characters).';
	detailsLabel.append(notes);
	const submit = makeMatchElement('button', 'challenge-secondary-button', 'Send private report');
	submit.type = 'submit';
	form.append(reasonLabel, detailsLabel, submit);
	details.append(form);
	return details;
};

const makeStreamForm = (match) => {
	const form = makeMatchElement('form', 'match-stream-form');
	form.dataset.matchId = match.id;
	const label = makeMatchElement('label', '', 'Public stream link');
	const input = document.createElement('input');
	input.name = 'streamUrl';
	input.type = 'url';
	input.maxLength = 500;
	input.placeholder = 'https://www.youtube.com/...';
	input.value = match.streamUrl || '';
	label.append(input);
	const note = makeMatchElement('small', 'match-stream-note', 'Visible to everyone after the opponent accepts, through 8 hours after kick-off. Use an HTTPS link from a supported streaming site.');
	const submit = makeMatchElement('button', 'challenge-secondary-button', match.streamUrl ? 'Save or remove link' : 'Share stream link');
	submit.type = 'submit';
	form.append(label, note, submit);
	return form;
};

const makeMatchChat = (match) => {
	const section = makeMatchElement('section', 'match-chat-widget');
	section.setAttribute('aria-label', 'Private match chat');
	const toggle = makeMatchElement('button', 'challenge-secondary-button match-chat-toggle', 'Open private chat');
	toggle.type = 'button';
	toggle.dataset.toggleMatchChat = match.id;
	toggle.setAttribute('aria-expanded', 'false');
	const panel = makeMatchElement('div', 'match-chat-panel');
	panel.dataset.chatPanel = match.id;
	panel.id = `match-chat-${match.id}`;
	toggle.setAttribute('aria-controls', panel.id);
	panel.hidden = true;
	const status = makeMatchElement('p', 'match-chat-status', 'Only the two match participants can view these messages.');
	status.setAttribute('role', 'status');
	status.setAttribute('aria-live', 'polite');
	const messages = makeMatchElement('ol', 'match-chat-messages');
	const form = makeMatchElement('form', 'match-chat-form');
	form.dataset.matchId = match.id;
	const label = makeMatchElement('label', '', 'Message');
	const input = document.createElement('textarea');
	input.name = 'message';
	input.maxLength = 500;
	input.rows = 2;
	input.required = true;
	input.placeholder = 'Write a message for your opponent...';
	label.append(input);
	const submit = makeMatchElement('button', 'challenge-primary-button', 'Send message');
	submit.type = 'submit';
	form.append(label, submit);
	panel.append(status, messages, form);
	section.append(toggle, panel);
	return section;
};

const renderMatchCards = (matches) => {
	const list = document.querySelector('#my-matches-list');
	chatPollers.forEach((timer) => window.clearInterval(timer));
	chatPollers.clear();
	list.replaceChildren();
	if (!matches.length) {
		list.append(makeMatchElement('p', 'challenge-list-empty', 'Your invitations and match reports appear here after you sign in.'));
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
		heading.append(title, makeMatchElement('span', `challenge-match-status status-${match.status}`, challengeStatusText(match.status, match)));
		card.append(heading, makeMatchElement('p', 'challenge-match-time', `${formatChallengeTime(match.scheduledAt)} · your local time · reminder ${match.reminderMinutes >= 1440 ? '24 hours' : `${match.reminderMinutes} minutes`} before`));
		if (match.status === 'pending' && !match.canReport && !match.isChallenger) {
			card.append(makeMatchElement('p', 'challenge-awaiting-note', 'Sign in with the invited account to accept or decline this match.'));
		}
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
			if (match.ranked && Number.isFinite(delta)) card.append(makeMatchElement('p', 'challenge-rating-change', `Ranked Elo change: ${delta > 0 ? '+' : ''}${delta}`));
			else if (match.ranked && match.result.farmCapApplied) {
				card.append(makeMatchElement('p', 'challenge-awaiting-note', 'This approved result did not change Elo because the daily limit for this opponent was reached.'));
			} else if (!match.ranked) {
				card.append(makeMatchElement('p', 'challenge-awaiting-note', 'Friendly result approved · Elo ratings are unchanged.'));
			}
		}
		const actions = makeMatchElement('div', 'challenge-match-actions');
		if (!match.canReport && match.status !== 'approved') {
			const signIn = makeMatchElement('a', 'challenge-secondary-button',
				match.status === 'pending' && !match.isChallenger ? 'Sign in to respond' : 'Sign in to manage this match');
			signIn.href = challengeSignInDestination;
			actions.append(signIn);
		} else if (match.status === 'pending' && !match.isChallenger) {
			addMatchAction(actions, 'accept', match.id, 'Accept invitation', true);
			addMatchAction(actions, 'decline', match.id, 'Decline');
		} else if (match.status === 'pending' && match.isChallenger) {
			addMatchAction(actions, 'resend', match.id, 'Resend invitation email');
			addMatchAction(actions, 'cancel', match.id, 'Cancel invitation');
		} else if (match.canReport && ['accepted', 'awaiting-opponent'].includes(match.status) &&
			Date.now() >= Date.parse(match.scheduledAt) + 20 * 60 * 1000) {
			addMatchAction(actions, 'walkover', match.id, 'Claim 3–0 walkover');
		} else if (match.status === 'awaiting-opponent' && match.result?.youReported) {
			card.append(makeMatchElement('p', 'challenge-awaiting-note', 'Your score and screenshot are saved. Waiting for the other player to submit their own report.'));
		} else if (match.canReport && ['accepted', 'awaiting-opponent', 'disputed', 'rejected'].includes(match.status) && Date.now() >= Date.parse(match.scheduledAt)) {
			card.append(makeScoreForm(match));
			if (match.status === 'disputed') card.append(makeMatchElement('p', 'challenge-warning', 'Your reports do not match. Submit the correct final score with a screenshot; disputed results are reviewed before Elo changes.'));
		} else if (['awaiting-opponent', 'disputed', 'pending-owner'].includes(match.status)) {
			card.append(makeMatchElement('p', 'challenge-awaiting-note', 'Both players must report the same score with a screenshot. The owner then reviews the evidence.'));
		}
		if (actions.childElementCount) card.append(actions);
		if (match.canReport && match.status !== 'cancelled') {
			card.append(match.playerReportSubmitted
				? makeMatchElement('p', 'challenge-awaiting-note', 'Your private report has been sent to league administrators.')
				: makePlayerReportForm(match));
		}
		if (!['declined', 'cancelled'].includes(match.status)) {
			card.append(makeStreamForm(match));
		}
		if (!['approved', 'declined', 'cancelled'].includes(match.status)) {
			card.append(makeMatchChat(match));
		}
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

const loadMatchChat = async (matchId, panel) => {
	if (panel.dataset.loading === 'true') return;
	panel.dataset.loading = 'true';
	const status = panel.querySelector('.match-chat-status');
	try {
		const result = await matchApi(`/api/matches/${encodeURIComponent(matchId)}/chat`);
		const messages = panel.querySelector('.match-chat-messages');
		messages.replaceChildren();
		if (!result.messages.length) {
			messages.append(makeMatchElement('li', 'match-chat-empty', 'No messages yet. Start the conversation with your opponent.'));
		}
		result.messages.forEach((entry) => {
			const item = makeMatchElement('li', 'match-chat-message');
			const heading = makeMatchElement('div', 'match-chat-message-heading');
			heading.append(
				makeMatchElement('strong', '', entry.isYou ? 'You' : entry.senderGamerTag),
				makeMatchElement('time', '', formatChallengeTime(entry.createdAt))
			);
			item.append(heading, makeMatchElement('p', '', entry.message));
			messages.append(item);
		});
		status.textContent = 'Only the two match participants can view these messages.';
		status.classList.remove('is-error');
		messages.scrollTop = messages.scrollHeight;
	} catch (error) {
		status.textContent = error.message;
		status.classList.add('is-error');
	} finally {
		delete panel.dataset.loading;
	}
};

const loadChallengeData = async () => {
	const wakeTimer = window.setTimeout(() => {
		matchMessage(challengeStatusMessage, 'The match server is waking up. Your player records and invitations will appear as soon as it responds.');
	}, 8000);
	try {
	const [health, playersResponse, session] = await Promise.all([
		matchApi('/api/health'),
		matchApi('/api/players'),
		matchApi('/api/auth/session')
	]);
	currentUserAuthenticated = session.authenticated === true;
	currentUserId = currentUserAuthenticated ? String(session.id || '') : '';
	directoryPlayers = playersResponse.players.filter((player) => !currentUserId || player.id !== currentUserId);
	renderPlayerDirectory();
	document.querySelector('#directory-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
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
	const matchesById = new Map(matchResults.filter(Boolean).map((match) => [match.id, match]));
	if (currentUserAuthenticated) {
		const accountMatches = await matchApi('/api/matches/active');
		accountMatches.matches.forEach((match) => matchesById.set(match.id, match));
	}
	const validMatches = [...matchesById.values()];
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
	} finally {
		window.clearTimeout(wakeTimer);
	}
};

const challengeForm = document.querySelector('#challenge-create-form');
if (challengeForm) {
	const dateInput = challengeForm.elements.scheduledAt;
	const challengeDialog = document.querySelector('#challenge-dialog');
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
	document.querySelector('#player-directory').addEventListener('click', (event) => {
		const button = event.target.closest('[data-challenge-player]');
		if (!button) return;
		const player = directoryPlayers.find((item) => item.id === button.dataset.challengePlayer);
		if (!player) return;
		if (!currentUserAuthenticated) {
			window.location.href = challengeSignInDestination;
			return;
		}
		opponentInput.value = player.id;
		document.querySelector('#challenge-dialog-title').textContent = `Challenge ${player.gamerTag}`;
		document.querySelector('#challenge-dialog-player-summary').textContent = `${player.rating.toLocaleString()} Elo · ${player.rankedMatches} approved ranked matches · private invitation sent to the profile email`;
		updateEarliestKickoff();
		challengeDialog.showModal();
	});
	document.querySelectorAll('[data-close-challenge]').forEach((button) => {
		button.addEventListener('click', () => challengeDialog.close());
	});
	challengeDialog.addEventListener('click', (event) => {
		if (event.target === challengeDialog) challengeDialog.close();
	});
	challengeForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (!currentUserAuthenticated) {
			window.location.href = challengeSignInDestination;
			return;
		}
		if (!opponentInput.value) {
			matchMessage(challengeStatusMessage, 'Choose an opponent before sending the challenge.', true);
			return;
		}
		const button = challengeForm.querySelector('button[type="submit"]');
		button.disabled = true;
		try {
			const date = new Date(dateInput.value);
			const result = await matchApi('/api/matches', { method: 'POST', body: JSON.stringify({
				opponentId: challengeForm.elements.opponentId.value,
				scheduledAt: date.toISOString(),
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				reminderMinutes: Number(challengeForm.elements.reminderMinutes.value),
				streamUrl: challengeForm.elements.streamUrl.value.trim(),
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

const incomingMatchLink = new URLSearchParams(window.location.search.slice(1));
new URLSearchParams(window.location.hash.slice(1)).forEach((value, key) => {
	if (!incomingMatchLink.has(key)) incomingMatchLink.set(key, value);
});
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
if (document.querySelector('#public-stream-list')) loadPublicStreams();

document.querySelector('#live-streams-retry')?.addEventListener('click', loadPublicStreams);

document.querySelector('#my-matches-list')?.addEventListener('click', async (event) => {
	const chatToggle = event.target.closest('[data-toggle-match-chat]');
	if (chatToggle) {
		const matchId = chatToggle.dataset.toggleMatchChat;
		const panel = Array.from(document.querySelectorAll('[data-chat-panel]'))
			.find((item) => item.dataset.chatPanel === matchId);
		if (!panel) return;
		const opening = panel.hidden;
		panel.hidden = !opening;
		chatToggle.setAttribute('aria-expanded', String(opening));
		if (opening) {
			await loadMatchChat(matchId, panel);
			if (!chatPollers.has(matchId)) {
				chatPollers.set(matchId, window.setInterval(() => loadMatchChat(matchId, panel), 15000));
			}
		} else if (chatPollers.has(matchId)) {
			window.clearInterval(chatPollers.get(matchId));
			chatPollers.delete(matchId);
		}
		return;
	}
	const button = event.target.closest('[data-match-action]');
	if (!button) return;
	const action = button.dataset.matchAction;
	if (action === 'walkover' && !window.confirm('Only continue if your opponent did not appear within 20 minutes of kick-off. This immediately records a 3–0 walkover and may update ranked Elo. Do you want to submit the claim?')) return;
	button.disabled = true;
	try {
		if (action === 'accept' || action === 'decline') {
			const response = await matchApi(`/api/matches/${encodeURIComponent(button.dataset.matchId)}/respond`, { method: 'POST', body: JSON.stringify({ action }) });
			matchMessage(challengeStatusMessage, `Invitation ${action === 'accept' ? 'accepted' : 'declined'}.${response.emailSent ? '' : ' Email notification could not be delivered.'}`, !response.emailSent);
		} else if (action === 'walkover') {
			const response = await matchApi(`/api/matches/${encodeURIComponent(button.dataset.matchId)}/walkover`, { method: 'POST', body: '{}' });
			matchMessage(challengeStatusMessage, `Walkover recorded as ${response.challengerScore}–${response.opponentScore}.`);
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
	const form = event.target.closest('.match-chat-form');
	if (!form) return;
	event.preventDefault();
	const button = form.querySelector('button[type="submit"]');
	const panel = form.closest('[data-chat-panel]');
	const status = panel.querySelector('.match-chat-status');
	const messageInput = form.querySelector('textarea[name="message"]');
	button.disabled = true;
	try {
		await matchApi(`/api/matches/${encodeURIComponent(form.dataset.matchId)}/chat`, {
			method: 'POST',
			body: JSON.stringify({ message: messageInput.value })
		});
		form.reset();
		await loadMatchChat(form.dataset.matchId, panel);
	} catch (error) {
		status.textContent = error.message;
		status.classList.add('is-error');
	} finally {
		button.disabled = false;
	}
});

document.querySelector('#my-matches-list')?.addEventListener('submit', async (event) => {
	const form = event.target.closest('.match-stream-form');
	if (!form) return;
	event.preventDefault();
	const button = form.querySelector('button[type="submit"]');
	button.disabled = true;
	try {
		const response = await matchApi(`/api/matches/${encodeURIComponent(form.dataset.matchId)}/stream`, {
			method: 'PUT',
			body: JSON.stringify({ streamUrl: form.elements.streamUrl.value.trim() })
		});
		matchMessage(challengeStatusMessage, response.message);
		await Promise.all([loadChallengeData(), loadPublicStreams()]);
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

document.querySelector('#my-matches-list')?.addEventListener('submit', async (event) => {
	const form = event.target.closest('.player-report-form');
	if (!form) return;
	event.preventDefault();
	const button = form.querySelector('button[type="submit"]');
	button.disabled = true;
	try {
		const result = await matchApi(`/api/matches/${encodeURIComponent(form.dataset.matchId)}/report-player`, {
			method: 'POST',
			body: JSON.stringify({
				reason: form.elements.reason.value,
				details: form.elements.details.value.trim()
			})
		});
		matchMessage(challengeStatusMessage, result.message || 'Your report was sent privately to league administrators.');
		form.closest('details').replaceWith(makeMatchElement('p', 'challenge-awaiting-note', 'Your private report has been sent to league administrators.'));
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

const homeDashboardStatus = document.querySelector('#home-dashboard-status');
const homeDashboardRetry = document.querySelector('#home-dashboard-retry');

if (homeDashboardStatus) {
	const updateText = (selector, value) => {
		const element = document.querySelector(selector);
		if (element) element.textContent = value;
	};
	const makeNode = (tag, className, text) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	};
	const formatDate = (value) => {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? 'Date unavailable'
			: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
	};
	const renderHomeDashboard = async () => {
		homeDashboardRetry.hidden = true;
		homeDashboardStatus.textContent = 'Loading verified league records…';
		const wakeTimer = window.setTimeout(() => {
			homeDashboardStatus.textContent = 'The server is waking up. Your league data will appear shortly…';
		}, 8000);
		try {
			const response = await fetch('/api/site/dashboard', { credentials: 'same-origin', cache: 'no-store' });
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.message || 'League information could not be loaded.');

			updateText('#hero-stat-players', Number(result.stats?.players || 0).toLocaleString());
			updateText('#hero-stat-matches', Number(result.stats?.approvedMatches || 0).toLocaleString());
			updateText('#hero-stat-cups', Number(result.stats?.activeEvents || 0).toLocaleString());
			updateText('#home-approved-count', `${Number(result.stats?.approvedMatches || 0).toLocaleString()} results`);
			homeDashboardStatus.textContent = 'League information from verified player records and administrator-published updates.';

			const announcement = result.announcement;
			const announcementLink = document.querySelector('#home-announcement');
			if (announcementLink) {
				announcementLink.hidden = true;
				updateText('#home-announcement-text', '');
				updateText('#home-announcement-link', '');
			}
			if (announcementLink && announcement?.active && announcement.text) {
				const allowedLink = /^(index|matches|tournaments|rankings|cup|play)\.html(?:#[\w-]+)?$/.test(announcement.linkUrl || '');
				announcementLink.href = allowedLink ? announcement.linkUrl : 'tournaments.html';
				updateText('#home-announcement-text', announcement.text);
				const linkText = document.querySelector('#home-announcement-link');
				if (linkText) linkText.textContent = announcement.linkText || 'View details';
				announcementLink.hidden = false;
			}

			const playerTable = document.querySelector('#home-player-rankings');
			if (playerTable) {
				playerTable.replaceChildren();
				if (!result.topPlayers?.length) {
					const row = makeNode('tr');
					const cell = makeNode('td', '', 'No verified player records yet.');
					cell.colSpan = 4;
					row.append(cell);
					playerTable.append(row);
				} else {
					result.topPlayers.forEach((player) => {
						const row = makeNode('tr');
						[player.rank, player.gamerTag, Number(player.rating || 0).toLocaleString(), `${player.wins || 0}–${player.draws || 0}–${player.losses || 0}`]
							.forEach((value) => row.append(makeNode('td', '', value)));
						playerTable.append(row);
					});
				}
			}

			const eventList = document.querySelector('#home-event-list');
			const featuredEvents = document.querySelector('#home-featured-events');
			const announcementList = document.querySelector('#home-announcement-list');
			const notificationsList = document.querySelector('#home-notifications-list');
			const newsList = document.querySelector('#home-news-list');
			const clubGrid = document.querySelector('#home-club-grid');
			for (const container of [eventList, featuredEvents, announcementList, notificationsList, newsList]) container?.replaceChildren();
			if (clubGrid) {
				clubGrid.replaceChildren();
				if (result.clubs?.length) {
					result.clubs.forEach((club) => {
						const card = makeNode('article', 'club-record-card');
						const header = makeNode('div', 'club-record-header');
						header.append(makeNode('span', 'club-record-rank', `#${String(club.rank).padStart(2, '0')}`));
						header.append(makeNode('span', 'club-record-members', `${club.members} verified player${club.members === 1 ? '' : 's'}`));
						card.append(header, makeNode('h3', '', club.name));
						const stats = makeNode('div', 'club-record-stats');
						[
							['Average Elo', Number(club.averageRating || 0).toLocaleString()],
							['Member record', club.record || '0–0–0']
						].forEach(([label, value]) => {
							const stat = makeNode('span');
							stat.append(makeNode('strong', '', value), makeNode('small', '', label));
							stats.append(stat);
						});
						card.append(stats);
						if (club.players?.length) card.append(makeNode('p', 'club-record-player-list', club.players.slice(0, 4).join(' · ')));
						clubGrid.append(card);
					});
				} else {
					clubGrid.append(makeNode('p', 'club-record-empty', 'No verified players have been assigned to a club yet. Administrators can assign players to clubs from the player profiles.'));
				}
			}
			if (result.events?.length) {
				result.events.forEach((event) => {
					const eventLink = `tournaments.html#event=${encodeURIComponent(event.id)}`;
					const eventDetails = [event.eventType, event.platform, event.format, event.dates].filter(Boolean).join(' · ');
					if (featuredEvents) {
						const article = makeNode('article', 'showcase-card');
						article.append(makeNode('span', 'showcase-tag', event.status || 'Published event'));
						article.append(makeNode('h3', '', event.title || 'Event'));
						article.append(makeNode('p', '', event.desc || eventDetails || 'Event information published by the league administrator.'));
						if (event.slots) article.append(makeNode('p', '', event.slots));
						if (event.prizePool) article.append(makeNode('p', '', `Prize: ${event.prizePool}`));
						const link = makeNode('a', '', event.registrationOpen ? 'Register' : 'View event details');
						link.href = eventLink;
						article.append(link);
						featuredEvents.append(article);
					}
					if (eventList) {
						const row = makeNode('div', 'tournament-row');
						row.append(makeNode('span', 'tournament-icon', (event.title || 'E').slice(0, 2).toUpperCase()));
						const details = makeNode('span');
						details.append(makeNode('strong', '', event.title || 'Event'));
						details.append(makeNode('small', '', [eventDetails, event.status].filter(Boolean).join(' · ')));
						const link = makeNode('a', 'join-link', 'Details');
						link.href = eventLink;
						row.append(details, link);
						eventList.append(row);
					}
					if (announcementList) {
						const item = makeNode('li');
						item.append(makeNode('span', '', '•'), makeNode('strong', '', event.title || 'Event'), makeNode('small', '', event.status || 'Published'));
						announcementList.append(item);
					}
					if (notificationsList) {
						const item = makeNode('a');
						item.href = eventLink;
						const icon = makeNode('span', 'notification-icon blue-notification', '+');
						const content = makeNode('span');
						content.append(makeNode('strong', '', event.title || 'Event'));
						content.append(makeNode('small', '', [event.status, eventDetails].filter(Boolean).join(' · ')));
						item.append(icon, content);
						notificationsList.append(item);
					}
					if (newsList) {
						const article = makeNode('article');
						article.append(makeNode('span', 'news-date', event.status || 'Event'));
						article.append(makeNode('h3', '', event.title || 'Event'));
						article.append(makeNode('p', '', eventDetails || 'Event information published by the league administrator.'));
						const link = makeNode('a', '', 'View event details →');
						link.href = eventLink;
						article.append(link);
						newsList.append(article);
					}
				});
			} else {
				eventList?.append(makeNode('p', '', 'No open events are published.'));
				featuredEvents?.append(makeNode('p', '', 'There are no published open events at this time.'));
				announcementList?.append(makeNode('li', '', 'No current announcements.'));
				notificationsList?.append(makeNode('p', '', 'No current updates.'));
				newsList?.append(makeNode('p', '', 'There are no current announcements or events.'));
			}

			if (announcement?.active && announcement.text) {
				const item = makeNode('li', '', announcement.text);
				announcementList?.prepend(item);
				const notification = makeNode('a');
				const allowedLink = /^(index|matches|tournaments|rankings|cup|play)\.html(?:#[\w-]+)?$/.test(announcement.linkUrl || '');
				notification.href = allowedLink ? announcement.linkUrl : 'tournaments.html';
				notification.append(makeNode('span', 'notification-icon gold-notification', '!'));
				const content = makeNode('span');
				content.append(makeNode('strong', '', 'League announcement'));
				content.append(makeNode('small', '', announcement.text));
				notification.append(content);
				notificationsList?.prepend(notification);
				const article = makeNode('article');
				article.append(makeNode('span', 'news-date', 'League announcement'));
				article.append(makeNode('h3', '', announcement.text));
				const link = makeNode('a', '', announcement.linkText || 'View details →');
				link.href = allowedLink ? announcement.linkUrl : 'tournaments.html';
				article.append(link);
				newsList?.prepend(article);
			}

			const personal = result.personal;
			if (personal) {
				const played = (Number(personal.wins) || 0) + (Number(personal.draws) || 0) + (Number(personal.losses) || 0);
				updateText('#dash-stat-matches', String(Number(personal.wins) + Number(personal.draws) + Number(personal.losses)));
				updateText('#dash-stat-record', `${personal.wins || 0}–${personal.draws || 0}–${personal.losses || 0}`);
				updateText('#dash-stat-winrate', `${played ? Math.round((personal.wins / played) * 100) : 0}%`);
				updateText('#dash-stat-streak', personal.streak ? `${personal.streak.count} ${personal.streak.outcome}${personal.streak.count === 1 ? '' : 's'}` : 'No streak');
				updateText('#dash-user-rank', personal.rank ? `#${String(personal.rank).padStart(2, '0')}` : '—');
				updateText('#dash-user-caption', `of ${Number(personal.rankedPlayers || 0).toLocaleString()} verified players`);
				updateText('#dash-user-rating', `${Number(personal.rating || 0).toLocaleString()} Elo`);
				updateText('#dash-user-tier', window.LEAGUE_CONFIG.getTier(personal.rating).name);
				const progress = document.querySelector('#dash-user-bar');
				if (progress) progress.style.width = `${personal.rankedPlayers ? Math.max(4, (1 - (personal.rank - 1) / personal.rankedPlayers) * 100) : 0}%`;
				updateText('#team-name', personal.gamerTag || 'You');
				updateText('#team-initial', (personal.gamerTag || 'Y').slice(0, 1).toUpperCase());
				if (personal.nextMatch) {
					updateText('#home-match-badge', personal.nextMatch.status);
					updateText('#home-match-comp', personal.nextMatch.competition);
					updateText('#home-match-type', 'Confirmed match');
					updateText('#opponent-name', personal.nextMatch.opponent);
					updateText('#opponent-initial', personal.nextMatch.opponent.slice(0, 2).toUpperCase());
					updateText('#home-match-schedule', formatDate(personal.nextMatch.scheduledAt));
				} else {
					updateText('#home-match-badge', 'No match scheduled');
					updateText('#home-match-schedule', 'Create or accept a challenge in the Match Centre.');
				}
			} else {
				updateText('#dash-stat-matches', '—');
				updateText('#dash-stat-record', '—');
				updateText('#dash-stat-winrate', '—');
				updateText('#dash-stat-streak', '—');
				updateText('#dash-user-caption', 'Sign in to view your ranking');
			}

			const results = personal?.recentResults?.length ? personal.recentResults : result.recentResults || [];
			const renderResults = (container, items, isPersonal) => {
				if (!container) return;
				container.replaceChildren();
				if (!items.length) {
					container.append(makeNode('p', '', 'No approved results have been recorded yet.'));
					return;
				}
				items.slice(0, 3).forEach((match) => {
					const outcome = isPersonal ? match.outcome : match.challengerScore === match.opponentScore ? 'draw' : 'result';
					const row = makeNode('div', 'result-row');
					row.append(makeNode('span', `result-mark ${outcome === 'win' ? 'win' : outcome === 'loss' ? 'loss' : 'draw'}`, outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : outcome === 'draw' ? 'D' : '✓'));
					const summary = makeNode('span');
					const score = isPersonal
						? `${personal.gamerTag} ${match.myScore} - ${match.opponentScore} ${match.opponent}`
						: `${match.challenger} ${match.challengerScore} - ${match.opponentScore} ${match.opponent}`;
					summary.append(makeNode('strong', '', score));
					summary.append(makeNode('small', '', formatDate(match.approvedAt)));
					row.append(summary);
					if (match.ratingChange !== null && match.ratingChange !== undefined) {
						row.append(makeNode('span', 'result-rating', `${match.ratingChange > 0 ? '+' : ''}${match.ratingChange} Elo`));
					}
					container.append(row);
				});
			};
			renderResults(document.querySelector('#home-recent-results'), results, Boolean(personal));
			renderResults(document.querySelector('#home-live-results'), result.recentResults || [], false);
		} catch (error) {
			homeDashboardStatus.textContent = `League data could not be loaded: ${error.message}`;
			homeDashboardRetry.hidden = false;
			document.querySelector('#home-club-grid')?.replaceChildren(makeNode('p', 'club-record-empty', 'Club records could not be loaded. Use retry to try again.'));
		} finally {
			window.clearTimeout(wakeTimer);
		}
	};
	homeDashboardRetry?.addEventListener('click', renderHomeDashboard);
	renderHomeDashboard();
}

const cupPage = document.querySelector('.cup-page');
if (cupPage) {
	const eventStatus = document.querySelector('#cup-status');
	const retry = document.querySelector('#cup-retry');
	const registerButton = document.querySelector('#cup-register-link');
	const bracketTree = document.querySelector('#cup-bracket-tree');
	let featuredCup = null;
	let isRegistered = false;
	const setText = (selector, value) => {
		const element = document.querySelector(selector);
		if (element) element.textContent = value;
	};
	const node = (tag, className = '', text = '') => {
		const element = document.createElement(tag);
		if (className) element.className = className;
		if (text) element.textContent = text;
		return element;
	};
	const renderBracket = (bracket) => {
		bracketTree.replaceChildren();
		const hasNamedRounds = ['round32', 'round16', 'round1', 'quarterFinals', 'semiFinals', 'finalMatch']
			.some((key) => Array.isArray(bracket?.[key]) || (key === 'finalMatch' && bracket?.finalMatch));
		const rounds = hasNamedRounds
			? [
				...(Array.isArray(bracket?.round32) ? [{ name: 'Round of 32', matches: bracket.round32 }] : []),
				...(Array.isArray(bracket?.round16) ? [{ name: 'Round of 16', matches: bracket.round16 }] : []),
				...(Array.isArray(bracket?.round1) ? [{ name: 'Round of 16', matches: bracket.round1 }] : []),
				...(Array.isArray(bracket?.quarterFinals) ? [{ name: 'Quarter-Finals', matches: bracket.quarterFinals }] : []),
				...(Array.isArray(bracket?.semiFinals) ? [{ name: 'Semi-Finals', matches: bracket.semiFinals }] : []),
				...(bracket?.finalMatch ? [{ name: 'Grand Final', matches: [bracket.finalMatch] }] : [])
			]
			: Array.isArray(bracket?.rounds) ? bracket.rounds : [];
		const visibleRounds = rounds.filter((round) => Array.isArray(round.matches) && round.matches.length);
		if (!visibleRounds.length) {
			bracketTree.append(node('p', 'club-record-empty', 'The official bracket has not been published yet. Check back after an administrator posts the seeds.'));
		} else {
			visibleRounds.forEach((round) => {
				const column = node('section', 'bracket-column');
				const header = node('div', 'bracket-round-header');
				header.append(node('h4', '', round.name || round.title || 'Knockout round'));
				header.append(node('span', '', `${round.matches.length} match${round.matches.length === 1 ? '' : 'es'}`));
				const list = node('div', 'bracket-matches-list');
				round.matches.forEach((match) => {
					const card = node('article', `bracket-match-card${round.name === 'Grand Final' ? ' is-final' : ''}`);
					['p1', 'p2'].forEach((side) => {
						const playerName = typeof match[side] === 'string' ? match[side] : match[side]?.gamerTag || match[side]?.name || 'TBD';
						const player = node('div', `bracket-team-btn${match.winner && match.winner === playerName ? ' is-winner' : ''}`, playerName || 'TBD');
						player.setAttribute('aria-label', `${side === 'p1' ? 'First' : 'Second'} player: ${playerName || 'To be determined'}`);
						card.append(player);
					});
					list.append(card);
				});
				column.append(header, list);
				bracketTree.append(column);
			});
		}
		const champion = bracket?.champion || bracket?.finalMatch?.winner;
		const banner = document.querySelector('#bracket-champion-banner');
		if (champion && champion !== 'TBD') {
			setText('#champ-name', champion);
			banner.hidden = false;
		} else {
			banner.hidden = true;
		}
	};
	const loadCup = async () => {
		retry.hidden = true;
		eventStatus.textContent = 'Loading event…';
		const wakeTimer = window.setTimeout(() => {
			eventStatus.textContent = 'The server is waking up. Cup information will appear shortly…';
		}, 8000);
		try {
			const [cupResponse, myEventsResponse] = await Promise.all([
				fetch('/api/site/cup', { cache: 'no-store' }),
				fetch('/api/me/tournaments', { credentials: 'same-origin', cache: 'no-store' })
			]);
			const payload = await cupResponse.json().catch(() => ({}));
			if (!cupResponse.ok) throw new Error(payload.message || 'League Cup information could not be loaded.');
			featuredCup = payload.event;
			const myEvents = myEventsResponse.ok ? await myEventsResponse.json() : null;
			isRegistered = Boolean(featuredCup && myEvents?.interestIds?.includes(featuredCup.id));
			if (!featuredCup) {
				eventStatus.textContent = 'No Cup event published';
				const statusElement = document.querySelector('#cup-status');
				if (statusElement) statusElement.dataset.status = 'unpublished';
				setText('#cup-description', 'There is no active League Cup event at the moment. Administrators will publish its details here when it is ready.');
				setText('#cup-event-format', 'No League Cup event has been published.');
				setText('#cup-opening-status', 'No Cup event published');
				setText('#cup-deadline-timer', 'Schedule not announced');
				setText('#cup-registration-note', 'Registration opens when an administrator publishes a Cup event.');
				registerButton.hidden = true;
			} else {
				const title = featuredCup.title || 'League Cup';
				const status = featuredCup.status || 'Coming Soon';
				const registrationOpen = featuredCup.registrationOpen === true && status === 'Registration Open';
				document.title = `${title} | Tim eFootball League`;
				setText('#cup-title', title);
				setText('#cup-kicker', featuredCup.kicker || 'League Cup');
				setText('#cup-description', featuredCup.desc || 'See the event format, eligibility, schedule, and registration details below.');
				setText('#cup-status', status);
				const statusElement = document.querySelector('#cup-status');
				if (statusElement) {
					statusElement.dataset.status = status.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
				}
				setText('#cup-event-kicker', featuredCup.kicker || 'League Cup event');
				setText('#cup-event-title', title);
				setText('#cup-event-format', featuredCup.format || 'Format to be announced');
				setText('#cup-format-heading', featuredCup.format || 'Event format');
				setText('#cup-format-description', featuredCup.rules || featuredCup.desc || 'Check the posted event details for eligibility, schedule, and organiser instructions.');
				setText('#cup-format-fact', featuredCup.format || 'TBC');
				setText('#cup-slots-fact', featuredCup.slots || 'TBC');
				setText('#cup-dates-fact', featuredCup.dates || 'TBC');
				setText('#cup-fact-type', featuredCup.eventType || 'Event format');
				setText('#cup-fact-type-description', featuredCup.format || 'The event structure will be published by the administrator.');
				setText('#cup-fact-platform', featuredCup.platform || 'Platform to be announced');
				setText('#cup-fact-platform-description', featuredCup.platform ? 'Official platform for this event.' : 'Check back for the supported platform.');
				setText('#cup-fact-prize', featuredCup.prizePool || 'Prize details to be announced');
				setText('#cup-fact-prize-description', featuredCup.prizeDetails || featuredCup.prizePool || 'The administrator will publish prizes and special honors.');
				setText('#cup-opening-status', status);
				setText('#cup-deadline-timer', featuredCup.dates || 'Schedule to be announced');
				setText('#cup-registration-note', registrationOpen ? 'Registration is open. Sign in with a verified account to register.' : 'Registration is currently closed.');
				setText('#cup-badge', featuredCup.badge || 'LC');
				registerButton.hidden = !registrationOpen;
				registerButton.textContent = isRegistered ? 'Withdraw registration' : 'Register for the Cup';
				registerButton.href = `tournaments.html#event=${encodeURIComponent(featuredCup.id)}`;
				if (registrationOpen) document.querySelector('#cup-timeline-registration')?.classList.add('active');
				if (payload.bracket && (payload.bracket.rounds || payload.bracket.round32 || payload.bracket.round1)) {
					document.querySelector('#cup-timeline-bracket')?.classList.add('active');
				}
				if (payload.bracket?.champion) document.querySelector('#cup-timeline-results')?.classList.add('completed');
			}
			renderBracket(payload.bracket);
			eventStatus.textContent = featuredCup?.status || 'No Cup event published';
		} catch (error) {
			eventStatus.textContent = `Cup information could not be loaded: ${error.message}`;
			retry.hidden = false;
			renderBracket(null);
			bracketTree.replaceChildren(node('p', 'club-record-empty', 'Cup information is temporarily unavailable. Use the retry button to try again.'));
		} finally {
			window.clearTimeout(wakeTimer);
		}
	};
	retry?.addEventListener('click', loadCup);
	loadCup();
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=47').catch(() => {
		// The interface remains usable when service workers are unavailable.
	});
}
