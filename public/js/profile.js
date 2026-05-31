/**
 * profile.js
 * Client-side script handling User Profile Settings, theme adjustments,
 * night-mode toggling, font scaling, and frontend image-to-SVG conversion.
 */

let currentSvgText = '';

document.addEventListener('DOMContentLoaded', () => {
    initializeProfileSettings();
});

function initializeProfileSettings() {
    // Check if redirect query parameter contains logout reason
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reason') === 'single_device') {
        showToast('Logged out: Account accessed from another device.', 'error');
    }

    // Set initial custom values
    currentSvgText = window.currentUserProfilePic || '';

    // Set up Theme Swatches click handlers
    const swatches = document.querySelectorAll('.theme-swatch');
    swatches.forEach(swatch => {
        const color = swatch.dataset.color;
        if (color === window.currentUserUiColor) {
            swatch.classList.add('active');
        }
        swatch.addEventListener('click', () => {
            swatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            document.getElementById('profile-ui-color').value = color;
            document.getElementById('profile-ui-color-picker').value = color;
        });
    });

    // Custom color picker handler
    const picker = document.getElementById('profile-ui-color-picker');
    if (picker) {
        picker.addEventListener('input', (e) => {
            swatches.forEach(s => s.classList.remove('active'));
            document.getElementById('profile-ui-color').value = e.target.value;
        });
    }

    // Set up Background Swatches click handlers
    const bgSwatches = document.querySelectorAll('.bg-swatch');
    bgSwatches.forEach(swatch => {
        const bg = swatch.dataset.bg;
        if (bg === window.currentUserBgColor) {
            swatch.classList.add('active');
        }
        swatch.addEventListener('click', () => {
            bgSwatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            document.getElementById('profile-bg-color').value = bg;
            document.getElementById('profile-bg-color-picker').value = bg;
            
            // Auto toggle night mode based on HSP brightness
            const dark = isColorDark(bg);
            document.getElementById('profile-night-mode').checked = dark;
            
            // Preview instantly
            document.documentElement.style.setProperty('--bg', bg);
            if (dark) {
                document.documentElement.classList.add('night-mode');
                document.body.classList.add('night-mode');
            } else {
                document.documentElement.classList.remove('night-mode');
                document.body.classList.remove('night-mode');
            }
        });
    });

    // Custom background picker handler
    const bgPicker = document.getElementById('profile-bg-color-picker');
    if (bgPicker) {
        bgPicker.addEventListener('input', (e) => {
            bgSwatches.forEach(s => s.classList.remove('active'));
            const bg = e.target.value;
            document.getElementById('profile-bg-color').value = bg;
            
            const dark = isColorDark(bg);
            document.getElementById('profile-night-mode').checked = dark;
            
            document.documentElement.style.setProperty('--bg', bg);
            if (dark) {
                document.documentElement.classList.add('night-mode');
                document.body.classList.add('night-mode');
            } else {
                document.documentElement.classList.remove('night-mode');
                document.body.classList.remove('night-mode');
            }
        });
    }

    // Set up Font Size button click handlers
    const fontBtns = document.querySelectorAll('.font-size-btn');
    fontBtns.forEach(btn => {
        const size = btn.dataset.size;
        if (size === window.currentUserFontSize) {
            btn.classList.add('active');
        }
        btn.addEventListener('click', () => {
            fontBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('profile-font-size').value = size;
            
            // Preview font size instantly
            const fontScaleMap = {
                small: '0.85',
                medium: '1.0',
                large: '1.15',
                xlarge: '1.3'
            };
            const scale = fontScaleMap[size] || '1.0';
            document.documentElement.style.setProperty('--font-scale', scale);
        });
    });

    // File input handler for image-to-SVG conversion
    const fileInput = document.getElementById('profile-pic-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleImageUpload);
    }

    // Set up Night Mode checkbox change handler
    const nightModeToggle = document.getElementById('profile-night-mode');
    if (nightModeToggle) {
        nightModeToggle.addEventListener('change', (e) => {
            const isDark = e.target.checked;
            if (isDark) {
                document.documentElement.classList.add('night-mode');
                document.body.classList.add('night-mode');
                // Select a default dark bg if current bg is light
                const currentBg = document.getElementById('profile-bg-color').value;
                if (!currentBg || !isColorDark(currentBg)) {
                    const defaultDarkBg = '#1e293b';
                    document.getElementById('profile-bg-color').value = defaultDarkBg;
                    document.getElementById('profile-bg-color-picker').value = defaultDarkBg;
                    document.documentElement.style.setProperty('--bg', defaultDarkBg);
                    // Update active bg swatch
                    const bgSwatches = document.querySelectorAll('.bg-swatch');
                    bgSwatches.forEach(s => {
                        s.classList.remove('active');
                        if (s.dataset.bg === defaultDarkBg) s.classList.add('active');
                    });
                }
            } else {
                document.documentElement.classList.remove('night-mode');
                document.body.classList.remove('night-mode');
                // Select a default light bg if current bg is dark
                const currentBg = document.getElementById('profile-bg-color').value;
                if (!currentBg || isColorDark(currentBg)) {
                    const defaultLightBg = '#f1f5f9';
                    document.getElementById('profile-bg-color').value = defaultLightBg;
                    document.getElementById('profile-bg-color-picker').value = defaultLightBg;
                    document.documentElement.style.setProperty('--bg', defaultLightBg);
                    // Update active bg swatch
                    const bgSwatches = document.querySelectorAll('.bg-swatch');
                    bgSwatches.forEach(s => {
                        s.classList.remove('active');
                        if (s.dataset.bg === defaultLightBg) s.classList.add('active');
                    });
                }
            }
        });
    }
}

function openProfileModal() {
    const modal = document.getElementById('profile-settings-modal');
    if (modal) {
        // Sync values to form from globals
        document.getElementById('profile-username').value = window.currentUsername;
        document.getElementById('profile-name').value = window.currentUserProfileName || '';
        document.getElementById('profile-email').value = window.currentUserEmail || '';
        document.getElementById('profile-font-size').value = window.currentUserFontSize || 'medium';
        document.getElementById('profile-ui-color').value = window.currentUserUiColor || '#2563eb';
        document.getElementById('profile-ui-color-picker').value = window.currentUserUiColor || '#2563eb';
        document.getElementById('profile-bg-color').value = window.currentUserBgColor || '';
        document.getElementById('profile-bg-color-picker').value = window.currentUserBgColor || '#f1f5f9';
        document.getElementById('profile-night-mode').checked = window.currentUserNightMode || false;

        // Reset active classes
        const swatches = document.querySelectorAll('.theme-swatch');
        swatches.forEach(s => {
            s.classList.remove('active');
            if (s.dataset.color === window.currentUserUiColor) s.classList.add('active');
        });

        const bgSwatches = document.querySelectorAll('.bg-swatch');
        bgSwatches.forEach(s => {
            s.classList.remove('active');
            if (s.dataset.bg === window.currentUserBgColor) s.classList.add('active');
        });

        const fontBtns = document.querySelectorAll('.font-size-btn');
        fontBtns.forEach(b => {
            b.classList.remove('active');
            if (b.dataset.size === window.currentUserFontSize) b.classList.add('active');
        });

        modal.style.display = 'flex';
    }
}

function closeProfileModal() {
    const modal = document.getElementById('profile-settings-modal');
    if (modal) {
        modal.style.display = 'none';

        // Revert temporary background/theme changes if cancel
        if (window.currentUserBgColor) {
            document.documentElement.style.setProperty('--bg', window.currentUserBgColor);
        } else {
            document.documentElement.style.removeProperty('--bg');
        }
        
        if (window.currentUserNightMode) {
            document.documentElement.classList.add('night-mode');
            document.body.classList.add('night-mode');
        } else {
            document.documentElement.classList.remove('night-mode');
            document.body.classList.remove('night-mode');
        }

        // Revert temporary font scale changes if cancel
        const fontScaleMap = {
            small: '0.85',
            medium: '1.0',
            large: '1.15',
            xlarge: '1.3'
        };
        const savedScale = fontScaleMap[window.currentUserFontSize || 'medium'] || '1.0';
        document.documentElement.style.setProperty('--font-scale', savedScale);
    }
}

/**
 * Handle custom profile image uploading and convert to clean SVG vector text
 */
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const previewContainer = document.getElementById('profile-avatar-preview');
    showToast('Converting image to premium SVG...', 'info');

    const reader = new FileReader();

    if (file.type === 'image/svg+xml') {
        // Already an SVG, read it as text
        reader.onload = function(evt) {
            const svgContent = evt.target.result;
            // Basic sanitization/wrapping if needed
            currentSvgText = svgContent;
            previewContainer.innerHTML = currentSvgText;
            showToast('SVG picture loaded successfully', 'success');
        };
        reader.readAsText(file);
    } else {
        // PNG or JPG - draw on canvas to crop/resize and embed as inline base64 image in SVG
        reader.onload = function(evt) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                canvas.width = 120;
                canvas.height = 120;
                const ctx = canvas.getContext('2d');
                
                // Crop to square and scale
                const size = Math.min(img.width, img.height);
                const xOffset = (img.width - size) / 2;
                const yOffset = (img.height - size) / 2;
                
                ctx.drawImage(img, xOffset, yOffset, size, size, 0, 0, 120, 120);
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);

                // Generate clean, modern vector-embedded SVG markup
                currentSvgText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
                    <circle cx="50" cy="50" r="48" fill="none" stroke="var(--primary)" stroke-width="2"/>
                    <clipPath id="circleClip">
                        <circle cx="50" cy="50" r="46"/>
                    </clipPath>
                    <image href="${compressedBase64}" x="4" y="4" width="92" height="92" clip-path="url(#circleClip)"/>
                </svg>`;

                previewContainer.innerHTML = currentSvgText;
                showToast('Image successfully converted to SVG!', 'success');
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Auto-generates a clean Google-branded initial SVG avatar if user enters email and doesn't upload custom picture
 */
function generateGmailAvatar(email, username) {
    const textVal = (email || username || '?').trim();
    const initials = textVal.charAt(0).toUpperCase();
    
    // Elegant linear gradient mapping based on initial letter
    const paletteGrads = [
        ['#4285F4', '#34A853'], // Google Blue-Green
        ['#ea4335', '#fbbc05'], // Google Red-Yellow
        ['#7c3aed', '#db2777'], // Purple-Rose
        ['#0288d1', '#00897b'], // Blue-Teal
        ['#f57c00', '#dc2626']  // Orange-Red
    ];
    const index = initials.charCodeAt(0) % paletteGrads.length;
    const grad = paletteGrads[index];

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
        <defs>
            <linearGradient id="gmailGrad-${initials}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${grad[0]}"/>
                <stop offset="100%" stop-color="${grad[1]}"/>
            </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill="url(#gmailGrad-${initials})"/>
        <text x="50" y="54" font-family="'Inter', sans-serif" font-size="42" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text>
    </svg>`;
}

async function saveProfileSettings(e) {
    e.preventDefault();

    const username = document.getElementById('profile-username').value.trim();
    const profileName = document.getElementById('profile-name').value.trim();
    const email = document.getElementById('profile-email').value.trim();
    const fontSize = document.getElementById('profile-font-size').value;
    const uiColor = document.getElementById('profile-ui-color').value;
    const bgColor = document.getElementById('profile-bg-color').value.trim();
    const nightMode = document.getElementById('profile-night-mode').checked;

    // Auto-generate profile pic from Gmail if email is provided (specifically ending in @gmail.com) and no custom pic is uploaded yet
    if (!currentSvgText && email && email.toLowerCase().endsWith('@gmail.com')) {
        currentSvgText = generateGmailAvatar(email, username);
    }

    try {
        const res = await fetch('/api/users/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                profileName,
                email,
                profilePic: currentSvgText,
                fontSize,
                uiColor,
                bgColor,
                nightMode
            })
        });

        if (res.status === 401) {
            showToast('Session expired. Redirecting...', 'error');
            setTimeout(() => { window.location.href = '/login?reason=single_device'; }, 1000);
            return;
        }

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.message || 'Failed to save settings');
        }

        // Update active variables
        window.currentUsername = data.user.username;
        window.currentUserProfileName = data.user.profileName;
        window.currentUserEmail = data.user.email;
        window.currentUserProfilePic = data.user.profilePic;
        window.currentUserFontSize = data.user.fontSize;
        window.currentUserUiColor = data.user.uiColor;
        window.currentUserBgColor = data.user.bgColor;
        window.currentUserNightMode = data.user.nightMode;

        // Apply visual updates instantly without reload
        applyDynamicStyles(data.user);

        showToast('Profile and appearance settings saved!', 'success');
        closeProfileModal();

        // Notify presence bar to re-sync updated avatar & display name to Firebase
        document.dispatchEvent(new CustomEvent('presenceBar:refreshProfile'));
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function applyDynamicStyles(user) {
    // 1. Apply Font Size (Proportional scaling)
    const fontScaleMap = {
        small: '0.85',
        medium: '1.0',
        large: '1.15',
        xlarge: '1.3'
    };
    const scale = fontScaleMap[user.fontSize] || '1.0';
    document.documentElement.style.setProperty('--font-scale', scale);

    // 2. Apply primary theme color
    if (user.uiColor) {
        document.documentElement.style.setProperty('--primary', user.uiColor);
        document.documentElement.style.setProperty('--primary-color', user.uiColor);
    }

    // 3. Apply Ambient Background color
    if (user.bgColor) {
        document.documentElement.style.setProperty('--bg', user.bgColor);
    } else {
        document.documentElement.style.removeProperty('--bg');
    }

    // 4. Apply Night Mode class
    if (user.nightMode) {
        document.documentElement.classList.add('night-mode');
        document.body.classList.add('night-mode');
    } else {
        document.documentElement.classList.remove('night-mode');
        document.body.classList.remove('night-mode');
    }

    // 5. Update top bar avatar and username
    const usernameTopbar = document.getElementById('top-bar-username-display');
    if (usernameTopbar) {
        const avatarContainer = document.getElementById('user-avatar-topbar');
        if (avatarContainer) {
            if (user.profilePic) {
                avatarContainer.innerHTML = user.profilePic;
            } else {
                const displayName = user.profileName || user.username;
                avatarContainer.textContent = displayName.charAt(0).toUpperCase();
            }
        }
        
        // Update username text (after the avatar span)
        usernameTopbar.innerHTML = '';
        usernameTopbar.appendChild(avatarContainer);
        
        const nameSpan = document.createElement('span');
        nameSpan.id = 'top-bar-user-name-text';
        nameSpan.textContent = user.profileName || user.username;
        usernameTopbar.appendChild(document.createTextNode(' Hi, '));
        usernameTopbar.appendChild(nameSpan);
    }

    // 6. Update preview container
    const previewContainer = document.getElementById('profile-avatar-preview');
    if (previewContainer) {
        if (user.profilePic) {
            previewContainer.innerHTML = user.profilePic;
        } else {
            const displayName = user.profileName || user.username;
            previewContainer.textContent = displayName.charAt(0).toUpperCase();
        }
    }
}

/**
 * HSP color model brightness formula check
 */
function isColorDark(hex) {
    if (!hex) return false;
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length !== 6) return false;
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const hsp = Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
    return hsp < 127.5;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return console.log(message);
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3500);
}

function validateProfileUsername(input) {
    const value = input.value.toLowerCase();
    input.value = value;
    const hasSpecial = /[^a-z0-9_]/.test(value);
    const warning = document.getElementById('profile-username-warning');
    const form = document.getElementById('profile-settings-form');
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
    
    if (hasSpecial) {
        if (warning) {
            warning.style.display = 'block';
        }
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.5';
            submitBtn.style.cursor = 'not-allowed';
        }
    } else {
        if (warning) {
            warning.style.display = 'none';
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }
    }
}
