// Admin Operations Console Client Logic
(function() {
    'use strict';

    let currentAdminKey = '';
    sessionStorage.removeItem('tim_admin_key');
    localStorage.removeItem('tim_admin_key');
    let adminUser = null;
    let cachedUsers = [];
    let cachedMatches = [];
    let cachedContent = {};

    const toastContainer = document.getElementById('admin-toast-container');
    const authDialog = document.getElementById('admin-auth-dialog');
    const authMessage = document.getElementById('admin-auth-message');
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);

    // Show toast message
    const showToast = (message, type = 'success') => {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `admin-toast toast-${type}`;
        toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : '⚠️'}</span> <span></span>`;
        toast.lastElementChild.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    };

    // Admin API fetch helper
    const adminFetch = async (url, options = {}) => {
        const headers = options.headers ? { ...options.headers } : {};
        if (currentAdminKey) {
            headers['X-Admin-Key'] = currentAdminKey;
        }
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';

        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'same-origin'
        });

        if (response.status === 403 || response.status === 401) {
            showAuthDialog();
            throw new Error('Admin authentication required.');
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.message || `Request failed with status ${response.status}`);
        }
        return data;
    };

    const showAuthDialog = () => {
        if (authDialog && !authDialog.open) {
            authDialog.showModal();
        }
    };

    const hideAuthDialog = () => {
        if (authDialog && authDialog.open) {
            authDialog.close();
        }
    };

    // Check existing admin session
    const checkAdminSession = async () => {
        try {
            const result = await adminFetch('/api/admin/session');
            if (result.ok && result.isAdmin) {
                adminUser = result.user;
                document.getElementById('admin-tag').textContent = adminUser.gamerTag || 'Admin';
                document.getElementById('admin-avatar').textContent = (adminUser.gamerTag || 'A').charAt(0).toUpperCase();
                hideAuthDialog();
                loadInitialData();
            } else {
                showAuthDialog();
            }
        } catch {
            showAuthDialog();
        }
    };

    // Master Key login
    document.getElementById('admin-key-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = document.getElementById('admin-master-key').value.trim();
        authMessage.textContent = 'Verifying key…';
        authMessage.className = 'admin-auth-message';

        try {
            const result = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ key })
            });
            const data = await result.json();
            if (!result.ok) throw new Error(data.message || 'Invalid master key.');

            document.getElementById('admin-master-key').value = '';
            adminUser = data.user;
            hideAuthDialog();
            showToast('Authenticated as Administrator!');
            loadInitialData();
        } catch (err) {
            authMessage.textContent = err.message.includes('fetch') ? 'Cannot connect to server. Ensure the server is running on port 3000.' : err.message;
            authMessage.className = 'admin-auth-message error';
        }
    });

    // Password login
    document.getElementById('admin-password-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value.trim();
        const password = document.getElementById('admin-password').value;
        authMessage.textContent = 'Authenticating…';
        authMessage.className = 'admin-auth-message';

        try {
            const result = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ email, password })
            });
            const data = await result.json();
            if (!result.ok) throw new Error(data.message || 'Invalid administrator credentials.');

            adminUser = data.user;
            hideAuthDialog();
            showToast('Signed in successfully.');
            loadInitialData();
        } catch (err) {
            authMessage.textContent = err.message.includes('fetch') ? 'Cannot connect to server. Ensure the server is running on port 3000.' : err.message;
            authMessage.className = 'admin-auth-message error';
        }
    });

    // Toggle password visibility buttons
    document.querySelectorAll('.btn-toggle-pw').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;
            if (input.type === 'password') {
                input.type = 'text';
                btn.textContent = '🙈';
            } else {
                input.type = 'password';
                btn.textContent = '👁️';
            }
        });
    });

    // Auth tabs toggle
    document.querySelectorAll('.admin-auth-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-auth-tab').forEach(t => t.classList.remove('is-active'));
            tab.classList.add('is-active');
            const mode = tab.dataset.authMode;
            document.getElementById('admin-key-form').hidden = mode !== 'key';
            document.getElementById('admin-password-form').hidden = mode !== 'password';
            authMessage.textContent = '';
        });
    });

    // Logout
    document.getElementById('admin-logout-btn')?.addEventListener('click', async () => {
        sessionStorage.removeItem('tim_admin_key');
        localStorage.removeItem('tim_admin_key');
        try {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        } catch {}
        window.location.href = 'index.html';
    });

    const loadPlayerReports = async () => {
        const tbody = document.getElementById('player-reports-tbody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading private player reports…</td></tr>';
        try {
            const data = await adminFetch('/api/admin/player-reports');
            const reports = data.reports || [];
            tbody.innerHTML = reports.length ? reports.map((report) => `
                <tr>
                    <td>${escapeHtml(new Date(report.createdAt).toLocaleString())}</td>
                    <td>${escapeHtml(report.reporter)}</td>
                    <td>${escapeHtml(report.reported)}</td>
                    <td><strong>${escapeHtml(report.reason.replace(/-/g, ' '))}</strong><br>${escapeHtml(report.details || 'No additional details')}</td>
                    <td>${escapeHtml(report.status)}</td>
                    <td class="text-right">${report.status === 'open' ? `
                        <button type="button" class="btn-action edit" data-report-id="${escapeHtml(report.id)}" data-report-status="reviewed">Mark reviewed</button>
                        <button type="button" class="btn-action delete" data-report-id="${escapeHtml(report.id)}" data-report-status="dismissed">Dismiss</button>
                    ` : '—'}</td>
                </tr>
            `).join('') : '<tr><td colspan="6" class="table-empty">No player reports have been submitted.</td></tr>';
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-error">Could not load reports: ${escapeHtml(error.message)}</td></tr>`;
        }
    };

    document.getElementById('player-reports-tbody')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-report-id]');
        if (!button) return;
        button.disabled = true;
        try {
            const result = await adminFetch(`/api/admin/player-reports/${encodeURIComponent(button.dataset.reportId)}`, {
                method: 'PUT',
                body: JSON.stringify({ status: button.dataset.reportStatus })
            });
            showToast(result.message || 'Player report updated.');
            await loadPlayerReports();
        } catch (error) {
            button.disabled = false;
            showToast(error.message, 'error');
        }
    });

    // Tab Navigation
    document.querySelectorAll('.admin-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('is-active'));
            document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.remove('is-active'));
            tab.classList.add('is-active');
            document.querySelectorAll('.admin-tab').forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
            const targetPane = document.getElementById(`pane-${tab.dataset.tab}`);
            if (targetPane) targetPane.classList.add('is-active');
            if (targetPane) {
                history.replaceState(null, '', `#${tab.dataset.tab}`);
                targetPane.setAttribute('tabindex', '-1');
                targetPane.focus({ preventScroll: true });
            }

            if (tab.dataset.tab === 'users') loadUsers();
            if (tab.dataset.tab === 'matches') {
                loadMatches();
                loadPlayerReports();
            }
            if (tab.dataset.tab === 'broadcast') loadBroadcastContent();
            if (tab.dataset.tab === 'tournaments') loadTournaments();
            if (tab.dataset.tab === 'clubs') loadClubs();
            if (tab.dataset.tab === 'bracket') loadBracket();
        });
    });

    const openAdminTab = (name) => document.querySelector(`.admin-tab[data-tab="${name}"]`)?.click();
    document.getElementById('btn-goto-tournaments')?.addEventListener('click', () => openAdminTab('tournaments'));
    document.getElementById('btn-goto-bracket')?.addEventListener('click', () => openAdminTab('bracket'));

    // Let operators jump between the seven work areas without leaving the keyboard.
    document.addEventListener('keydown', (event) => {
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
        const tab = document.querySelector(`.admin-tab[data-tab="${['overview', 'users', 'matches', 'broadcast', 'tournaments', 'clubs', 'bracket'][Number(event.key) - 1] || ''}"]`);
        if (tab) {
            event.preventDefault();
            tab.click();
        }
    });

    const initialTab = window.location.hash.slice(1);
    if (initialTab && document.querySelector(`.admin-tab[data-tab="${CSS.escape(initialTab)}"]`)) openAdminTab(initialTab);

    // Shortcuts from overview cards
    document.getElementById('btn-goto-broadcast')?.addEventListener('click', () => {
        document.querySelector('.admin-tab[data-tab="broadcast"]')?.click();
    });
    document.getElementById('btn-goto-users')?.addEventListener('click', () => {
        document.querySelector('.admin-tab[data-tab="users"]')?.click();
    });
    document.getElementById('btn-goto-matches')?.addEventListener('click', () => {
        document.querySelector('.admin-tab[data-tab="matches"]')?.click();
    });

    // Load Overview Data
    const loadOverview = async () => {
        try {
            const data = await adminFetch('/api/admin/overview');
            const stats = data.stats;
            document.getElementById('stat-total-users').textContent = stats.totalUsers;
            document.getElementById('stat-verified-users').textContent = `${stats.verifiedUsers} verified accounts`;
            document.getElementById('stat-total-matches').textContent = stats.totalMatches;
            document.getElementById('stat-approved-matches').textContent = `${stats.approvedMatches} approved fixtures`;
            document.getElementById('stat-pending-reviews').textContent = stats.pendingReviews;

            if (stats.topPlayer) {
                document.getElementById('stat-top-player').textContent = stats.topPlayer.gamerTag;
                document.getElementById('stat-top-player-elo').textContent = `${stats.topPlayer.rating} Elo · ${stats.topPlayer.wins} wins`;
            } else {
                document.getElementById('stat-top-player').textContent = '—';
                document.getElementById('stat-top-player-elo').textContent = 'No player data';
            }
        } catch (err) {
            console.error('Failed to load overview:', err);
        }
    };

    // Load Users
    const loadUsers = async () => {
        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Loading players from database…</td></tr>';
        try {
            const data = await adminFetch('/api/admin/users');
            cachedUsers = data.users || [];
            renderUsersTable();
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="table-error">Error loading players: ${err.message}</td></tr>`;
        }
    };

    const renderUsersTable = () => {
        const tbody = document.getElementById('users-tbody');
        const search = (document.getElementById('user-search-input')?.value || '').toLowerCase().trim();
        const roleFilter = document.getElementById('user-filter-role')?.value || 'all';
        const verifiedFilter = document.getElementById('user-filter-verified')?.value || 'all';

        const filtered = cachedUsers.filter((u) => {
            const matchSearch = (u.gamerTag || '').toLowerCase().includes(search) ||
                                (u.name || '').toLowerCase().includes(search);
            const matchRole = roleFilter === 'all' || u.role === roleFilter;
            const matchVerified = verifiedFilter === 'all' ||
                                  (verifiedFilter === 'verified' && u.verified) ||
                                  (verifiedFilter === 'unverified' && !u.verified);
            return matchSearch && matchRole && matchVerified;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No players matched your filters.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map((u) => `
            <tr>
                <td>
                    <div class="table-player-cell">
                        <span class="user-avatar-badge">${(u.gamerTag || 'P').charAt(0).toUpperCase()}</span>
                        <div>
                            <strong>${escapeHtml(u.gamerTag)}</strong>
                                <small>${escapeHtml(u.name)}</small>
                        </div>
                    </div>
                </td>
                <td><span class="text-email">Private</span></td>
                <td><strong class="user-elo-val">${u.rating.toLocaleString()}</strong></td>
                <td><span class="user-record-pill">${u.wins}W - ${u.draws}D - ${u.losses}L</span></td>
                <td>
                    <span class="status-badge ${u.verified ? 'badge-verified' : 'badge-unverified'}">
                        ${u.verified ? '✓ Verified' : 'Unverified'}
                    </span>
                </td>
                <td>
                    <span class="status-badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">
                        ${u.role === 'admin' ? '⚡ Admin' : 'Player'}
                    </span>
                </td>
                <td class="text-right">
                    <div class="row-actions">
                        <button type="button" class="btn-action edit" data-user-id="${encodeURIComponent(u.id)}" title="Edit Player">✏️ Edit</button>
                        <button type="button" class="btn-action password" data-user-id="${encodeURIComponent(u.id)}" data-player-tag="${escapeHtml(u.gamerTag)}" title="Set Password">🔑 Pass</button>
                        <button type="button" class="btn-action delete" data-user-id="${encodeURIComponent(u.id)}" data-player-tag="${escapeHtml(u.gamerTag)}" title="Delete Account">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');
    };

    document.getElementById('user-search-input')?.addEventListener('input', renderUsersTable);
    document.getElementById('user-filter-role')?.addEventListener('change', renderUsersTable);
    document.getElementById('user-filter-verified')?.addEventListener('change', renderUsersTable);

    // Edit User Modal
    const modalEditUser = document.getElementById('modal-edit-user');
    document.getElementById('users-tbody')?.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('.btn-action.edit');
        const btnPass = e.target.closest('.btn-action.password');
        const btnDel = e.target.closest('.btn-action.delete');

        if (btnEdit) {
            const userId = decodeURIComponent(btnEdit.dataset.userId);
            const user = cachedUsers.find(u => u.id === userId);
            if (!user) return;

            document.getElementById('edit-user-original-id').value = user.id;
            document.getElementById('edit-user-tag').value = user.gamerTag;
            document.getElementById('edit-user-name').value = user.name;
            document.getElementById('edit-user-email').value = '';
            document.getElementById('edit-user-rating').value = user.rating;
            document.getElementById('edit-user-record').textContent = `${user.wins}W – ${user.draws}D – ${user.losses}L`;
            document.getElementById('edit-user-role').value = user.role || 'user';
            document.getElementById('edit-user-verified').value = String(user.verified);
            document.getElementById('edit-user-platform').value = user.platform || '';
            document.getElementById('edit-user-country').value = user.country || '';
            document.getElementById('edit-user-time-zone').value = user.timeZone || 'UTC';
            document.getElementById('edit-user-club-name').value = user.clubName || '';
            document.getElementById('edit-user-feedback').textContent = '';

            modalEditUser.showModal();
        }

        if (btnPass) {
            const userId = decodeURIComponent(btnPass.dataset.userId);
            const tag = btnPass.dataset.playerTag;
            const newPass = prompt(`Enter new password for player (${tag}):\n(Minimum 6 characters)`);
            if (newPass && newPass.length >= 6) {
                adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
                    method: 'POST',
                    body: JSON.stringify({ newPassword: newPass })
                }).then(() => {
                    showToast(`Password updated for ${tag}`);
                }).catch(err => {
                    alert(`Error: ${err.message}`);
                });
            } else if (newPass !== null) {
                alert('Password must be at least 6 characters.');
            }
        }

        if (btnDel) {
            const userId = decodeURIComponent(btnDel.dataset.userId);
            const tag = btnDel.dataset.playerTag;
            if (confirm(`Are you sure you want to permanently delete player ${tag}?\nThis action cannot be undone.`)) {
                adminFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
                    method: 'DELETE'
                }).then(() => {
                    showToast(`Player ${tag} deleted.`);
                    loadUsers();
                    loadOverview();
                }).catch(err => {
                    alert(`Error: ${err.message}`);
                });
            }
        }
    });

    // Form: Edit User Submit
    document.getElementById('form-edit-user')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const originalUserId = document.getElementById('edit-user-original-id').value;
        const feedback = document.getElementById('edit-user-feedback');
        feedback.textContent = 'Saving changes live…';
        feedback.className = 'modal-feedback';

        const updatedData = {
            gamerTag: document.getElementById('edit-user-tag').value.trim(),
            name: document.getElementById('edit-user-name').value.trim(),
            email: document.getElementById('edit-user-email').value.trim() || undefined,
            rating: Number(document.getElementById('edit-user-rating').value),
            role: document.getElementById('edit-user-role').value,
            verified: document.getElementById('edit-user-verified').value === 'true',
            platform: document.getElementById('edit-user-platform').value,
            country: document.getElementById('edit-user-country').value.trim(),
            timeZone: document.getElementById('edit-user-time-zone').value.trim() || 'UTC',
            clubName: document.getElementById('edit-user-club-name').value.trim()
        };

        try {
            const res = await adminFetch(`/api/admin/users/${encodeURIComponent(originalUserId)}`, {
                method: 'PUT',
                body: JSON.stringify(updatedData)
            });
            showToast(res.message || 'Player updated live.');
            modalEditUser.close();
            loadUsers();
            loadOverview();
        } catch (err) {
            feedback.textContent = err.message;
            feedback.className = 'modal-feedback error';
        }
    });

    // Create User Modal
    const modalCreateUser = document.getElementById('modal-create-user');
    document.getElementById('btn-open-create-user')?.addEventListener('click', () => {
        document.getElementById('form-create-user').reset();
        document.getElementById('create-user-feedback').textContent = '';
        modalCreateUser.showModal();
    });
    document.getElementById('btn-quick-new-user')?.addEventListener('click', () => {
        document.getElementById('form-create-user').reset();
        modalCreateUser.showModal();
    });

    document.getElementById('form-create-user')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('create-user-feedback');
        feedback.textContent = 'Creating account…';
        feedback.className = 'modal-feedback';

        const newUser = {
            gamerTag: document.getElementById('create-user-tag').value.trim(),
            name: document.getElementById('create-user-name').value.trim(),
            email: document.getElementById('create-user-email').value.trim(),
            password: document.getElementById('create-user-password').value,
            rating: Number(document.getElementById('create-user-rating').value),
            role: document.getElementById('create-user-role').value,
            verified: document.getElementById('create-user-verified').value === 'true'
        };

        try {
            const res = await adminFetch('/api/admin/users', {
                method: 'POST',
                body: JSON.stringify(newUser)
            });
            showToast(res.message || 'Player created.');
            modalCreateUser.close();
            loadUsers();
            loadOverview();
        } catch (err) {
            feedback.textContent = err.message;
            feedback.className = 'modal-feedback error';
        }
    });

    // Close Modals
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
        btn.addEventListener('click', () => {
            btn.closest('dialog')?.close();
        });
    });

    // Load Matches
    let currentMatchStatusFilter = 'all';
    const loadMatches = async () => {
        const tbody = document.getElementById('matches-tbody');
        tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading matches from database…</td></tr>';
        try {
            const data = await adminFetch('/api/admin/all-matches');
            cachedMatches = data.matches || [];
            renderMatchesTable();
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-error">Error loading matches: ${err.message}</td></tr>`;
        }
    };

    const renderMatchesTable = () => {
        const tbody = document.getElementById('matches-tbody');
        const filtered = cachedMatches.filter((m) => {
            if (currentMatchStatusFilter === 'all') return true;
            return m.status === currentMatchStatusFilter;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No matches found with this status filter.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map((m) => {
            const scoreText = m.scores
                ? `<strong>${m.scores.challenger} — ${m.scores.opponent}</strong>`
                : '<span class="text-muted">Not reported</span>';
            const compLabel = (m.competition || 'Cup').toUpperCase();
            const dateStr = m.scheduledAt ? new Date(m.scheduledAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'TBD';

            return `
                <tr>
                    <td>
                        <span class="comp-badge comp-${m.competition}">${compLabel}</span>
                        <small class="match-id-sub">#${m.id.slice(0, 10)}</small>
                    </td>
                    <td>
                        <div class="match-players-cell">
                            <strong>${escapeHtml(m.challenger.gamerTag)}</strong>
                            <span class="text-vs">vs</span>
                            <strong>${escapeHtml(m.opponent.gamerTag)}</strong>
                        </div>
                    </td>
                    <td><small>${dateStr}</small></td>
                    <td>${scoreText}</td>
                    <td><span class="match-status-pill status-${m.status}">${m.status}</span></td>
                    <td class="text-right">
                        <div class="row-actions">
                            <button type="button" class="btn-action edit" data-match-id="${m.id}" title="Edit / Settle Match">⚖️ Settle</button>
                            <button type="button" class="btn-action delete" data-match-id="${m.id}" title="Delete Match">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    };

    document.querySelectorAll('#match-status-tabs .filter-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#match-status-tabs .filter-tab').forEach(t => t.classList.remove('is-active'));
            tab.classList.add('is-active');
            currentMatchStatusFilter = tab.dataset.status;
            renderMatchesTable();
        });
    });

    // Edit Match Modal
    const modalEditMatch = document.getElementById('modal-edit-match');
    document.getElementById('matches-tbody')?.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('.btn-action.edit');
        const btnDel = e.target.closest('.btn-action.delete');

        if (btnEdit) {
            const matchId = btnEdit.dataset.matchId;
            const match = cachedMatches.find(m => m.id === matchId);
            if (!match) return;

            document.getElementById('edit-match-id').value = match.id;
            document.getElementById('match-modal-participants').innerHTML = `
                <div class="modal-h2h-row">
                    <span>${escapeHtml(match.challenger.gamerTag)} (${match.challenger.rating} Elo)</span>
                    <strong>VS</strong>
                    <span>${escapeHtml(match.opponent.gamerTag)} (${match.opponent.rating} Elo)</span>
                </div>
            `;
            document.getElementById('edit-match-challenger-score').value = match.scores ? match.scores.challenger : 0;
            document.getElementById('edit-match-opponent-score').value = match.scores ? match.scores.opponent : 0;
            document.getElementById('edit-match-status').value = match.status;
            document.getElementById('edit-match-ranked').value = String(match.ranked !== false);
            document.getElementById('edit-match-note').value = match.reviewNote || '';
            document.getElementById('edit-match-feedback').textContent = '';

            modalEditMatch.showModal();
        }

        if (btnDel) {
            const matchId = btnDel.dataset.matchId;
            if (confirm(`Delete match fixture #${matchId}?`)) {
                adminFetch(`/api/admin/matches/${encodeURIComponent(matchId)}`, {
                    method: 'DELETE'
                }).then(() => {
                    showToast('Match deleted.');
                    loadMatches();
                    loadOverview();
                }).catch(err => {
                    alert(`Error: ${err.message}`);
                });
            }
        }
    });

    // Form: Edit Match Submit
    document.getElementById('form-edit-match')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const matchId = document.getElementById('edit-match-id').value;
        const feedback = document.getElementById('edit-match-feedback');
        feedback.textContent = 'Saving match decision live…';

        const challengerScore = Number(document.getElementById('edit-match-challenger-score').value);
        const opponentScore = Number(document.getElementById('edit-match-opponent-score').value);
        const status = document.getElementById('edit-match-status').value;
        const ranked = document.getElementById('edit-match-ranked').value === 'true';
        const note = document.getElementById('edit-match-note').value;

        try {
            let res;
            if (status === 'approved') {
                res = await adminFetch(`/api/admin/matches/${encodeURIComponent(matchId)}/force-approve`, {
                    method: 'POST',
                    body: JSON.stringify({ challengerScore, opponentScore, note })
                });
            } else {
                res = await adminFetch(`/api/admin/matches/${encodeURIComponent(matchId)}`, {
                    method: 'PUT',
                    body: JSON.stringify({ status, challengerScore, opponentScore, ranked, reviewNote: note })
                });
            }
            showToast(res.message || 'Match outcome recorded live!');
            modalEditMatch.close();
            loadMatches();
            loadOverview();
        } catch (err) {
            feedback.textContent = err.message;
            feedback.className = 'modal-feedback error';
        }
    });

    // Create Match Modal
    const modalCreateMatch = document.getElementById('modal-create-match');
    const openCreateMatchModal = () => {
        // Populate challenger and opponent selects with all available players
        const selectC = document.getElementById('create-match-challenger');
        const selectO = document.getElementById('create-match-opponent');
        selectC.innerHTML = '';
        selectO.innerHTML = '';

        cachedUsers.forEach((u) => {
            selectC.add(new Option(`${u.gamerTag} (${u.rating} Elo)`, u.id));
            selectO.add(new Option(`${u.gamerTag} (${u.rating} Elo)`, u.id));
        });
        if (cachedUsers.length > 1) {
            selectO.selectedIndex = 1;
        }

        // Default tomorrow
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        document.getElementById('create-match-date').value = tomorrow.toISOString().slice(0, 16);
        document.getElementById('create-match-feedback').textContent = '';
        modalCreateMatch.showModal();
    };

    document.getElementById('btn-open-create-match')?.addEventListener('click', openCreateMatchModal);
    document.getElementById('btn-quick-new-match')?.addEventListener('click', openCreateMatchModal);

    document.getElementById('form-create-match')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('create-match-feedback');
        feedback.textContent = 'Scheduling fixture…';

        const payload = {
            challengerId: document.getElementById('create-match-challenger').value,
            opponentId: document.getElementById('create-match-opponent').value,
            competition: document.getElementById('create-match-comp').value,
            scheduledAt: new Date(document.getElementById('create-match-date').value).toISOString(),
            ranked: document.getElementById('create-match-ranked').value === 'true'
        };

        try {
            const res = await adminFetch('/api/admin/matches', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast(res.message || 'Match fixture scheduled live.');
            modalCreateMatch.close();
            loadMatches();
            loadOverview();
        } catch (err) {
            feedback.textContent = err.message;
            feedback.className = 'modal-feedback error';
        }
    });

    // Recalculate Rankings
    document.getElementById('btn-recalculate-rankings')?.addEventListener('click', async () => {
        if (!confirm('Recalculate all player records and rankings?')) return;
        try {
            const res = await adminFetch('/api/admin/rankings/recalculate', { method: 'POST' });
            showToast(res.message || 'Rankings refreshed.');
            loadOverview();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Load Live Broadcast Banner
    const loadBroadcastContent = async () => {
        try {
            const data = await adminFetch('/api/admin/content');
            const ann = data.content?.announcement || {};
            document.getElementById('broadcast-active').checked = Boolean(ann.active);
            document.getElementById('broadcast-text').value = ann.text || '';
            document.getElementById('broadcast-link-text').value = ann.linkText || '';
            document.getElementById('broadcast-link-url').value = ann.linkUrl || '';

            const themeRadio = document.querySelector(`input[name="broadcast-theme"][value="${ann.type || 'gold'}"]`);
            if (themeRadio) themeRadio.checked = true;

            updateBroadcastPreview();
        } catch (err) {
            console.error('Failed to load broadcast content:', err);
        }
    };

    const updateBroadcastPreview = () => {
        const text = document.getElementById('broadcast-text').value || 'Live Announcement Preview';
        const linkText = document.getElementById('broadcast-link-text').value;
        const linkUrl = document.getElementById('broadcast-link-url').value;
        const active = document.getElementById('broadcast-active').checked;
        const theme = document.querySelector('input[name="broadcast-theme"]:checked')?.value || 'gold';

        const previewBar = document.getElementById('preview-bar');
        const previewText = document.getElementById('preview-text');
        const previewLink = document.getElementById('preview-link');

        if (!active) {
            previewBar.style.opacity = '0.35';
        } else {
            previewBar.style.opacity = '1';
        }

        previewBar.className = `site-announcement-bar announcement-${theme}`;
        previewText.textContent = text;
        if (linkText && linkUrl) {
            previewLink.hidden = false;
            previewLink.textContent = linkText;
            previewLink.href = linkUrl;
        } else {
            previewLink.hidden = true;
        }
    };

    document.getElementById('broadcast-active')?.addEventListener('change', updateBroadcastPreview);
    document.getElementById('broadcast-text')?.addEventListener('input', updateBroadcastPreview);
    document.getElementById('broadcast-link-text')?.addEventListener('input', updateBroadcastPreview);
    document.getElementById('broadcast-link-url')?.addEventListener('input', updateBroadcastPreview);
    document.querySelectorAll('input[name="broadcast-theme"]').forEach(r => r.addEventListener('change', updateBroadcastPreview));

    document.getElementById('broadcast-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('broadcast-feedback');
        feedback.textContent = 'Publishing sitewide banner live…';

        const payload = {
            active: document.getElementById('broadcast-active').checked,
            text: document.getElementById('broadcast-text').value.trim(),
            linkText: document.getElementById('broadcast-link-text').value.trim(),
            linkUrl: document.getElementById('broadcast-link-url').value.trim(),
            type: document.querySelector('input[name="broadcast-theme"]:checked')?.value || 'gold'
        };

        try {
            const res = await adminFetch('/api/admin/content/announcement', {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            feedback.textContent = '✓ Announcement published live across all pages!';
            showToast('Broadcast banner is now live sitewide!');
            loadAdminActivity();
        } catch (err) {
            feedback.textContent = `Error: ${err.message}`;
        }
    });

    // Tournaments Management
    const modalTournament = document.getElementById('modal-tournament');
    const syncFeaturedCupTitle = () => {
        const titleInput = document.getElementById('t-title');
        const featuredCupInput = document.getElementById('t-featured-cup');
        if (!titleInput || !featuredCupInput) return;
        titleInput.readOnly = featuredCupInput.checked;
        if (featuredCupInput.checked) titleInput.value = 'Tim League Cup 2026';
    };
    document.getElementById('t-featured-cup')?.addEventListener('change', syncFeaturedCupTitle);
    const syncTournamentPreview = () => {
        const value = (id, fallback) => document.getElementById(id)?.value.trim() || fallback;
        document.getElementById('t-preview-title').textContent = value('t-title', 'Your event title');
        document.getElementById('t-preview-status').textContent = value('t-status', 'Coming Soon');
        document.getElementById('t-preview-format').textContent = value('t-format', 'Format will appear here');
        const localStart = document.getElementById('t-starts-at')?.value;
        const schedule = localStart ? new Date(localStart).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : value('t-dates', 'Schedule to be announced');
        document.getElementById('t-preview-meta').textContent = `${schedule} · ${value('t-slots', 'Unlimited places')}`;
    };
    document.getElementById('form-tournament')?.addEventListener('input', syncTournamentPreview);
    document.getElementById('form-tournament')?.addEventListener('change', syncTournamentPreview);

    const loadTournaments = async () => {
        const grid = document.getElementById('tournaments-cards-grid');
        if (!grid) return;
        grid.innerHTML = '<p class="table-loading">Loading tournament entries…</p>';
        try {
            const [tData, iData] = await Promise.all([
                adminFetch('/api/admin/content'),
                adminFetch('/api/admin/tournaments/interests').catch(() => ({ interestCounts: {} }))
            ]);

            const tournaments = tData.content?.tournaments || [];
            cachedContent.tournaments = tournaments;
            const interests = iData.interestCounts || {};

            if (!tournaments.length) {
                grid.innerHTML = '<p class="table-loading" style="grid-column: 1/-1;">No tournaments added yet. Click "+ Add Tournament" to create one.</p>';
                return;
            }

            grid.innerHTML = tournaments.map((t, idx) => {
                const interestCount = interests[t.id] || 0;
                const statusCls = t.status === 'Registration Open' ? 'open' : t.status === 'In Progress' ? 'live' : 'upcoming';
                const isPublished = t.published !== false;
                return `
                <div class="admin-event-card" data-tid="${escapeHtml(t.id)}">
                    <div class="event-card-header">
                        <span class="event-badge">${escapeHtml(t.badge || 'EVENT')}</span>
                        <span class="event-publication-tag ${isPublished ? 'is-published' : 'is-draft'}" style="padding:4px 8px; border-radius:999px; background:${isPublished ? 'rgba(86, 214, 154, 0.1)' : 'rgba(148, 163, 184, 0.1)'}; color:${isPublished ? '#86efac' : '#cbd5e1'}; font-size:0.65rem; font-weight:800;">${isPublished ? 'Published' : 'Draft'}</span>
                        <span class="event-status-tag status-${statusCls}">${escapeHtml(t.status || 'Coming Soon')}</span>
                    </div>
                    <h3>${escapeHtml(t.title)}</h3>
                    <p class="event-desc">${t.kicker ? `<em>${escapeHtml(t.kicker)}</em><br>` : ''}${escapeHtml(t.desc || 'No description provided.')}</p>
                    <div class="event-details-grid">
                        <div><span>Format:</span> <strong>${escapeHtml(t.format || 'Not set')}</strong></div>
                        <div><span>Slots:</span> <strong>${escapeHtml(t.slots || 'Unlimited')}</strong></div>
                        <div><span>Dates:</span> <strong>${escapeHtml(t.dates || 'Not set')}</strong></div>
                        ${t.eventType ? `<div><span>Event type:</span> <strong>${escapeHtml(t.eventType)}</strong></div>` : ''}
                        ${t.platform ? `<div><span>Platform:</span> <strong>${escapeHtml(t.platform)}</strong></div>` : ''}
                        <div><span>Registered:</span> <strong style="color: #f4b72f;">★ ${interestCount} players</strong></div>
                        ${t.featuredCup ? '<div><span>Public page:</span> <strong>League Cup</strong></div>' : ''}
                        ${t.prizePool ? `<div><span>Prize:</span> <strong>${escapeHtml(t.prizePool)}</strong></div>` : ''}
                        ${t.minElo || t.maxElo ? `<div><span>Elo Req:</span> <strong>${t.minElo ? escapeHtml(t.minElo) + '+' : 'Any'} ${t.maxElo ? 'to ' + escapeHtml(t.maxElo) : ''}</strong></div>` : ''}
                    </div>
                    <div class="event-actions">
                        <button type="button" class="btn-action edit" data-edit-tourn="${escapeHtml(t.id)}">Edit</button>
                        <button type="button" class="btn-action" data-duplicate-tourn="${escapeHtml(t.id)}">Duplicate</button>
                        <button type="button" class="btn-action" data-roster-tourn="${escapeHtml(t.id)}" style="background: rgba(244, 183, 47, 0.12); color: #f4b72f; border-color: rgba(244, 183, 47, 0.3);">Roster (${interestCount})</button>
                        <button type="button" class="btn-action toggle-reg" data-toggle-reg="${escapeHtml(t.id)}" data-current="${Boolean(t.registrationOpen)}" ${!isPublished ? 'disabled title="Publish this event before opening registration."' : ''}>${t.registrationOpen ? 'Close registration' : isPublished ? 'Open registration' : 'Publish to open registration'}</button>
                        <button type="button" class="btn-action delete" data-delete-tourn="${escapeHtml(t.id)}">Remove</button>
                    </div>
                </div>
            `;
            }).join('');
        } catch (err) {
            grid.innerHTML = `<p class="table-error">Error loading tournaments: ${err.message}</p>`;
        }
    };

    // Open Tournament Roster / Participants Modal
    const modalTournamentRoster = document.getElementById('modal-tournament-roster');
    let currentRosterTournId = null;

    const openTournamentRoster = async (tid) => {
        currentRosterTournId = tid;
        const t = (cachedContent.tournaments || []).find(item => item.id === tid);
        if (!t || !modalTournamentRoster) return;

        document.getElementById('roster-tournament-title').textContent = `${t.title} — Competitors`;
        document.getElementById('roster-tournament-subtitle').textContent = `Format: ${t.format} · Schedule: ${t.dates || 'TBC'}`;
        const tbody = document.getElementById('roster-tbody');
        tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Loading registered players…</td></tr>';
        modalTournamentRoster.showModal();

        try {
            const data = await adminFetch(`/api/admin/tournaments/${encodeURIComponent(tid)}/participants`);
            const participants = data.participants || [];

            if (!participants.length) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 25px; color: #94a3b8;">No registered players yet for this event.</td></tr>';
                return;
            }

            tbody.innerHTML = participants.map((p, idx) => `
                <tr>
                    <td><strong style="color: ${idx < 3 ? '#f4b72f' : '#94a3b8'};">#${idx + 1}</strong></td>
                    <td><strong>${escapeHtml(p.gamerTag)}</strong> <small style="color: #64748b;">(${escapeHtml(p.name)})</small></td>
                    <td><small style="color: #cbd5e1;">Private</small></td>
                    <td><strong class="user-elo-val">${p.rating.toLocaleString()}</strong></td>
                    <td><small>${p.wins}W–${p.draws}D–${p.losses}L</small></td>
                    <td><small>${p.checkedInAt ? `Checked in ${escapeHtml(new Date(p.checkedInAt).toLocaleString())}` : 'Not checked in'}</small></td>
                    <td class="text-right">
                        <button type="button" class="btn-action delete" data-remove-player="${encodeURIComponent(p.id)}" data-player-tag="${escapeHtml(p.gamerTag)}" style="padding: 4px 8px; font-size: 0.72rem;">Remove</button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="table-error">Error loading roster: ${err.message}</td></tr>`;
        }
    };

    // Handle Kick Player from Roster
    document.getElementById('roster-tbody')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-remove-player]');
        if (!btn || !currentRosterTournId) return;

        const userId = decodeURIComponent(btn.dataset.removePlayer);
        const tag = btn.dataset.playerTag;

        if (confirm(`Remove player "${tag}" from this tournament?`)) {
            try {
                const res = await adminFetch(`/api/admin/tournaments/${encodeURIComponent(currentRosterTournId)}/participants/${encodeURIComponent(userId)}`, {
                    method: 'DELETE'
                });
                showToast(res.message || 'Player removed from roster.');
                openTournamentRoster(currentRosterTournId);
                loadTournaments();
                loadAdminActivity();
            } catch (err) {
                alert(`Error: ${err.message}`);
            }
        }
    });

    // Open Add Tournament Modal
    document.getElementById('btn-add-tournament')?.addEventListener('click', () => {
        if (!modalTournament) return;
        document.getElementById('modal-tournament-title').textContent = 'Add Tournament';
        document.getElementById('tournament-edit-id').value = '';
        document.getElementById('form-tournament').reset();
        syncFeaturedCupTitle();
        document.getElementById('tournament-feedback').textContent = '';
        syncTournamentPreview();
        modalTournament.showModal();
    });

    // Handle Edit / Toggle / Delete from Grid
    document.getElementById('tournaments-cards-grid')?.addEventListener('click', async (e) => {
        const btnEdit = e.target.closest('[data-edit-tourn]');
        const btnDuplicate = e.target.closest('[data-duplicate-tourn]');
        const btnDel = e.target.closest('[data-delete-tourn]');
        const btnToggle = e.target.closest('[data-toggle-reg]');
        const btnRoster = e.target.closest('[data-roster-tourn]');

        if (btnDuplicate) {
            const t = (cachedContent.tournaments || []).find(item => item.id === btnDuplicate.dataset.duplicateTourn);
            const form = document.getElementById('form-tournament');
            if (!t || !modalTournament || !form) return;

            form.reset();
            document.getElementById('modal-tournament-title').textContent = 'Duplicate Tournament';
            document.getElementById('tournament-edit-id').value = '';
            document.getElementById('t-title').value = `${String(t.title || 'Tournament').slice(0, 72)} - Copy`;
            document.getElementById('t-badge').value = t.badge || '';
            document.getElementById('t-kicker').value = '';
            document.getElementById('t-status').value = 'Coming Soon';
            document.getElementById('t-format').value = t.format || '';
            document.getElementById('t-slots').value = t.slots || '';
            document.getElementById('t-event-type').value = t.eventType || '';
            document.getElementById('t-platform').value = t.platform || '';
            document.getElementById('t-dates').value = '';
            document.getElementById('t-starts-at').value = '';
            document.getElementById('t-prize').value = '';
            document.getElementById('t-prize-details').value = '';
            document.getElementById('t-min-elo').value = t.minElo ?? '';
            document.getElementById('t-max-elo').value = t.maxElo ?? '';
            document.getElementById('t-entry-link').value = '';
            document.getElementById('t-desc').value = '';
            document.getElementById('t-rules').value = '';
            document.getElementById('t-reg-open').checked = false;
            document.getElementById('t-checkin-open').checked = false;
            document.getElementById('t-published').checked = false;
            document.getElementById('t-featured-cup').checked = false;
            syncFeaturedCupTitle();
            document.getElementById('tournament-feedback').textContent = 'Format, capacity, and Elo limits were copied. Add the event-specific details before saving.';
            syncTournamentPreview();
        modalTournament.showModal();
            return;
        }

        if (btnRoster) {
            openTournamentRoster(btnRoster.dataset.rosterTourn);
            return;
        }

        if (btnEdit) {
            const tid = btnEdit.dataset.editTourn;
            const t = (cachedContent.tournaments || []).find(item => item.id === tid);
            if (!t || !modalTournament) return;

            document.getElementById('modal-tournament-title').textContent = 'Edit Tournament';
            document.getElementById('tournament-edit-id').value = t.id;
            document.getElementById('t-title').value = t.title || '';
            document.getElementById('t-badge').value = t.badge || '';
            document.getElementById('t-kicker').value = t.kicker || '';
            document.getElementById('t-status').value = t.status || 'Coming Soon';
            document.getElementById('t-format').value = t.format || '';
            document.getElementById('t-slots').value = t.slots || '';
            document.getElementById('t-event-type').value = t.eventType || '';
            document.getElementById('t-platform').value = t.platform || '';
            document.getElementById('t-dates').value = t.dates || '';
            document.getElementById('t-starts-at').value = t.startsAt ? new Date(new Date(t.startsAt).getTime() - new Date(t.startsAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
            document.getElementById('t-prize').value = t.prizePool || '';
            document.getElementById('t-prize-details').value = t.prizeDetails || '';
            document.getElementById('t-min-elo').value = t.minElo || '';
            document.getElementById('t-max-elo').value = t.maxElo || '';
            document.getElementById('t-entry-link').value = t.entryLink || '';
            document.getElementById('t-desc').value = t.desc || '';
            document.getElementById('t-rules').value = t.rules || '';
            document.getElementById('t-reg-open').checked = Boolean(t.registrationOpen);
            document.getElementById('t-checkin-open').checked = Boolean(t.checkInOpen);
            document.getElementById('t-published').checked = t.published !== false;
            document.getElementById('t-featured-cup').checked = Boolean(t.featuredCup);
            syncFeaturedCupTitle();
            document.getElementById('tournament-feedback').textContent = '';

            syncTournamentPreview();
        modalTournament.showModal();
        }

        if (btnToggle) {
            const tid = btnToggle.dataset.toggleReg;
            const current = btnToggle.dataset.current === 'true';
            const newStatus = !current ? 'Registration Open' : 'Coming Soon';
            try {
                await adminFetch(`/api/admin/tournaments/${encodeURIComponent(tid)}`, {
                    method: 'PUT',
                    body: JSON.stringify({ registrationOpen: !current, status: newStatus })
                });
                showToast(`Registration ${!current ? 'opened' : 'closed'}!`);
                loadTournaments();
                loadAdminActivity();
            } catch (err) {
                alert(`Error toggling registration: ${err.message}`);
            }
        }

        if (btnDel) {
            const tid = btnDel.dataset.deleteTourn;
            if (confirm('Delete this tournament event?')) {
                try {
                    await adminFetch(`/api/admin/tournaments/${encodeURIComponent(tid)}`, {
                        method: 'DELETE'
                    });
                    showToast('Tournament deleted.');
                    loadTournaments();
                    loadAdminActivity();
                } catch (err) {
                    alert(`Error: ${err.message}`);
                }
            }
        }
    });

    // Submit Tournament Form
    document.getElementById('form-tournament')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('tournament-edit-id').value;
        const feedback = document.getElementById('tournament-feedback');
        const submitButton = document.getElementById('tournament-submit-btn');
        submitButton.disabled = true;
        submitButton.textContent = 'Saving…';
        feedback.textContent = 'Saving tournament…';
        feedback.className = 'modal-feedback';

        const payload = {
            title: document.getElementById('t-title').value.trim(),
            badge: document.getElementById('t-badge').value.trim(),
            kicker: document.getElementById('t-kicker').value.trim(),
            status: document.getElementById('t-status').value,
            format: document.getElementById('t-format').value.trim(),
            slots: document.getElementById('t-slots').value.trim(),
            eventType: document.getElementById('t-event-type').value.trim(),
            platform: document.getElementById('t-platform').value.trim(),
            dates: document.getElementById('t-dates').value.trim(),
            startsAt: document.getElementById('t-starts-at').value ? new Date(document.getElementById('t-starts-at').value).toISOString() : null,
            prizePool: document.getElementById('t-prize').value.trim(),
            prizeDetails: document.getElementById('t-prize-details').value.trim(),
            minElo: document.getElementById('t-min-elo').value ? Number(document.getElementById('t-min-elo').value) : null,
            maxElo: document.getElementById('t-max-elo').value ? Number(document.getElementById('t-max-elo').value) : null,
            entryLink: document.getElementById('t-entry-link').value.trim(),
            desc: document.getElementById('t-desc').value.trim(),
            rules: document.getElementById('t-rules').value.trim(),
            registrationOpen: document.getElementById('t-reg-open').checked ||
                document.getElementById('t-status').value === 'Registration Open',
            checkInOpen: document.getElementById('t-checkin-open').checked,
            published: document.getElementById('t-published').checked,
            featuredCup: document.getElementById('t-featured-cup').checked
        };

        try {
            const url = editId ? `/api/admin/tournaments/${encodeURIComponent(editId)}` : '/api/admin/tournaments';
            const method = editId ? 'PUT' : 'POST';
            const res = await adminFetch(url, {
                method,
                body: JSON.stringify(payload)
            });
            showToast(res.message || 'Tournament saved!');
            modalTournament.close();
            loadTournaments();
            loadAdminActivity();
        } catch (err) {
            feedback.textContent = err.message;
            feedback.className = 'modal-feedback error';
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Save Tournament';
        }
    });

    // Club standings are derived from verified player profiles.
    const loadClubs = async () => {
        const tbody = document.getElementById('clubs-tbody');
        tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading club standings from player records…</td></tr>';
        try {
            const data = await adminFetch('/api/site/clubs');
            const clubs = data.clubs || [];
            tbody.innerHTML = clubs.length ? clubs.map((club) => `
                <tr>
                    <td><strong>#${club.rank}</strong></td>
                    <td><strong>${escapeHtml(club.name)}</strong></td>
                    <td>${club.members}</td>
                    <td><strong class="user-elo-val">${Number(club.averageRating).toLocaleString()}</strong></td>
                    <td>${escapeHtml(club.record)}</td>
                    <td>${club.players.map(escapeHtml).join(', ')}</td>
                </tr>
            `).join('') : '<tr><td colspan="6" class="table-empty">No verified players have a club assignment. Assign a club in the player editor.</td></tr>';
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-error">Error: ${escapeHtml(err.message)}</td></tr>`;
        }
    };

    document.getElementById('btn-clubs-goto-users')?.addEventListener('click', () => {
        document.querySelector('.admin-tab[data-tab="users"]')?.click();
    });

    // League Cup Bracket Master
    const loadBracket = async () => {
        const container = document.getElementById('admin-bracket-tree');
        container.innerHTML = '<p class="table-loading">Loading tournament bracket…</p>';
        try {
            const data = await adminFetch('/api/admin/content');
            const bracket = data.content?.bracket || {};
            cachedContent.bracket = bracket;
            cachedContent.tournaments = data.content?.tournaments || [];
            renderAdminBracket();
        } catch (err) {
            container.innerHTML = `<p class="table-error">Error: ${err.message}</p>`;
        }
    };

    const renderAdminBracket = () => {
        const container = document.getElementById('admin-bracket-tree');
        const b = cachedContent.bracket || {};
        const legacy = Array.isArray(b.round1);
        const rounds = legacy
            ? [
                { key: 'round1', name: 'Round of 16', matches: b.round1 },
                { key: 'quarterFinals', name: 'Quarter-Finals', matches: b.quarterFinals || [] },
                { key: 'semiFinals', name: 'Semi-Finals', matches: b.semiFinals || [] },
                { key: 'finalMatch', name: 'Grand Final', matches: b.finalMatch ? [b.finalMatch] : [] }
            ]
            : [
                { key: 'round32', name: 'Round of 32', matches: b.round32 || [] },
                { key: 'round16', name: 'Round of 16', matches: b.round16 || [] },
                { key: 'quarterFinals', name: 'Quarter-Finals', matches: b.quarterFinals || [] },
                { key: 'semiFinals', name: 'Semi-Finals', matches: b.semiFinals || [] },
                { key: 'finalMatch', name: 'Grand Final', matches: b.finalMatch ? [b.finalMatch] : [] }
            ];
        if (!rounds.some((round) => round.matches.length)) {
            container.innerHTML = '<p class="table-loading">No Cup bracket is published yet. Select “Seed from registered players” to build one from the featured Cup roster.</p>';
            return;
        }
        container.innerHTML = `<div class="admin-bracket-grid">${rounds.map((round) => `
            <div class="bracket-col ${round.key === 'finalMatch' ? 'final-col' : ''}">
                <h4>${round.name} (${round.matches.length} match${round.matches.length === 1 ? '' : 'es'})</h4>
                ${round.matches.map((match, idx) => `
                    <div class="admin-bracket-card ${round.key === 'finalMatch' ? 'is-final' : ''}">
                        ${['p1', 'p2'].map((side) => {
                            const team = match[side] || 'TBD';
                            const selected = match.winner === team && team !== 'TBD';
                            return `<label class="bracket-team-option ${selected ? 'is-winner' : ''}">
                                <input type="radio" name="${round.key}-${idx}" value="${side}" data-bracket-round="${round.key}" data-bracket-index="${idx}" ${selected ? 'checked' : ''} ${team === 'TBD' ? 'disabled' : ''}>
                                <span>${escapeHtml(team)}</span>
                            </label>`;
                        }).join('')}
                    </div>
                `).join('')}
                ${round.key === 'finalMatch' && b.champion ? `<div class="admin-champ-box">🏆 CROWNED CHAMPION: <strong>${escapeHtml(b.champion)}</strong></div>` : ''}
            </div>
        `).join('')}</div>`;
    };

    document.getElementById('admin-bracket-tree')?.addEventListener('change', (e) => {
        const input = e.target;
        const b = cachedContent.bracket;
        if (!b) return;
        const legacy = Array.isArray(b.round1);
        const keys = legacy
            ? ['round1', 'quarterFinals', 'semiFinals', 'finalMatch']
            : ['round32', 'round16', 'quarterFinals', 'semiFinals', 'finalMatch'];
        const roundKey = input.dataset.bracketRound;
        const roundIndex = keys.indexOf(roundKey);
        if (roundIndex < 0) return;
        const matchIndex = Number(input.dataset.bracketIndex);
        const roundMatches = roundKey === 'finalMatch' ? [b.finalMatch] : b[roundKey];
        const match = roundMatches?.[matchIndex];
        if (!match) return;
        match.winner = match[input.value];
        if (roundKey === 'finalMatch') {
            b.champion = match.winner;
        } else {
            const nextKey = keys[roundIndex + 1];
            const nextIndex = Math.floor(matchIndex / 2);
            const nextSide = matchIndex % 2 === 0 ? 'p1' : 'p2';
            const nextMatch = nextKey === 'finalMatch' ? b.finalMatch : b[nextKey]?.[nextIndex];
            if (nextMatch) {
                nextMatch[nextSide] = match.winner;
                nextMatch.winner = null;
                for (let followingRound = roundIndex + 2; followingRound < keys.length; followingRound += 1) {
                    const followingKey = keys[followingRound];
                    const followingIndex = Math.floor(nextIndex / 2);
                    const followingSide = nextIndex % 2 === 0 ? 'p1' : 'p2';
                    const followingMatch = followingKey === 'finalMatch' ? b.finalMatch : b[followingKey]?.[followingIndex];
                    if (followingMatch) {
                        followingMatch[followingSide] = 'TBD';
                        followingMatch.winner = null;
                    }
                }
                b.champion = null;
            }
        }
        renderAdminBracket();
    });

    document.getElementById('btn-reset-bracket-default')?.addEventListener('click', async () => {
        const cup = (cachedContent.tournaments || []).find((tournament) => tournament.featuredCup === true);
        if (!cup) {
            alert('Mark one event as the League Cup in Tournament Management before seeding the bracket.');
            return;
        }
        const existingBracketHasWinners = [
            ...(cachedContent.bracket?.round32 || []),
            ...(cachedContent.bracket?.round16 || []),
            ...(cachedContent.bracket?.round1 || []),
            ...(cachedContent.bracket?.quarterFinals || []),
            ...(cachedContent.bracket?.semiFinals || []),
            ...(cachedContent.bracket?.finalMatch ? [cachedContent.bracket.finalMatch] : [])
        ].some((match) => match.winner);
        if (existingBracketHasWinners && !confirm('Regenerating seeds clears all current bracket winners. Continue?')) return;
        try {
            const data = await adminFetch(`/api/admin/tournaments/${encodeURIComponent(cup.id)}/participants`);
            const players = (data.participants || []).slice(0, 32);
            const seedOrder = [1, 32, 16, 17, 8, 25, 9, 24, 4, 29, 13, 20, 5, 28, 12, 21, 2, 31, 15, 18, 7, 26, 10, 23, 3, 30, 14, 19, 6, 27, 11, 22];
            const seeded = new Map(players.map((player, index) => [index + 1, `#${index + 1} ${player.gamerTag}`]));
            const round32 = Array.from({ length: 16 }, (_, index) => ({
                p1: seeded.get(seedOrder[index * 2]) || 'TBD',
                p2: seeded.get(seedOrder[index * 2 + 1]) || 'TBD',
                winner: null
            }));
            const createRound = (length) => Array.from({ length }, () => ({ p1: 'TBD', p2: 'TBD', winner: null }));
            const round16 = createRound(8);
            const quarterFinals = createRound(4);
            const semiFinals = createRound(2);
            const finalMatch = { p1: 'TBD', p2: 'TBD', winner: null };
            cachedContent.bracket = {
                rounds: [
                    { name: 'Round of 32', matches: round32 },
                    { name: 'Round of 16', matches: round16 },
                    { name: 'Quarter-Finals', matches: quarterFinals },
                    { name: 'Semi-Finals', matches: semiFinals },
                    { name: 'Grand Final', matches: [finalMatch] }
                ],
                round32,
                round16,
                quarterFinals,
                semiFinals,
                finalMatch,
                champion: null,
                generatedAt: new Date().toISOString()
            };
            renderAdminBracket();
            showToast(`Bracket seeded from ${players.length} registered player${players.length === 1 ? '' : 's'}; unfilled places remain TBD.`);
        } catch (err) {
            alert(`Could not load the registered Cup players: ${err.message}`);
        }
    });

    document.getElementById('btn-save-bracket-live')?.addEventListener('click', async () => {
        try {
            await adminFetch('/api/admin/content/bracket', {
                method: 'PUT',
                body: JSON.stringify(cachedContent.bracket)
            });
            showToast('Knockout Bracket published live to cup.html!');
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    const loadAdminActivity = async () => {
        const list = document.getElementById('admin-activity-list');
        if (!list) return;
        try {
            const data = await adminFetch('/api/admin/activity?limit=30');
            list.innerHTML = data.activity?.length ? data.activity.map((entry) => `
                <li><span class="activity-action">${escapeHtml(entry.action)}</span><div><strong>${escapeHtml(entry.summary)}</strong><small>${escapeHtml(entry.entity)} · ${escapeHtml(entry.actor)} · ${escapeHtml(new Date(entry.createdAt).toLocaleString())}</small></div></li>
            `).join('') : '<li>No publishing changes recorded yet.</li>';
        } catch (error) {
            list.innerHTML = `<li class="activity-error">Could not load activity: ${escapeHtml(error.message)}</li>`;
        }
    };

    // Initial Data Load
    const loadInitialData = async () => {
        await Promise.all([loadOverview(), loadUsers(), loadAdminActivity()]);
    };

    // Run Auth Check on startup
    checkAdminSession();

})();
