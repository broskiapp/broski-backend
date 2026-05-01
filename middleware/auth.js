const jwt = require('jsonwebtoken');
const axios = require('axios');
const Admin = require('../models/Admin');
const User = require('../models/User');
const ExpressError = require('../utils/ExpressError');
const config = require('../config');
const { getEffectiveSubscription } = require('../utils/subscriptionUtils');

// Middleware to verify JWT token and authenticate admin
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            throw new ExpressError('Access token required', 401);
        }

        // Verify the token
        const decoded = jwt.verify(token, config.JWT_SECRET);

        // Find the admin in the database
        const admin = await Admin.findById(decoded.userId).select('-password');
        if (!admin) {
            throw new ExpressError('Invalid token - admin not found', 401);
        }

        // Add user info to request object
        req.user = {
            userId: admin._id,
            email: admin.email,
            name: admin.name,
            role: admin.role,
            type: 'admin'
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw new ExpressError('Invalid token', 401);
        } else if (error.name === 'TokenExpiredError') {
            throw new ExpressError('Token expired', 401);
        }
        next(error);
    }
};

// Middleware to check if user is admin (optional - for admin-only routes)
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        throw new ExpressError('Admin access required', 403);
    }
    next();
};

// Middleware to authenticate application users (not admins)
const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            throw new ExpressError('Access token required', 401);
        }

        // Verify the token
        const decoded = jwt.verify(token, config.JWT_SECRET);

        // Find the user in the database
        const user = await User.findById(decoded.userId).select('-password').lean();
        if (!user) {
            throw new ExpressError('Invalid token - user not found', 401);
        }

        const effective = getEffectiveSubscription(user);
        req.user = {
            userId: user._id,
            email: user.email,
            name: user.name,
            subscriptionTier: effective.subscriptionTier,
            subscriptionStatus: effective.subscriptionStatus,
            isSubscribed: effective.isSubscribed,
            isActive: user.isActive !== false,
            type: 'user'
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw new ExpressError('Invalid token', 401);
        } else if (error.name === 'TokenExpiredError') {
            throw new ExpressError('Token expired', 401);
        }
        next(error);
    }
};

// Middleware to authenticate either admin or user
const authenticateAny = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            throw new ExpressError('Access token required', 401);
        }

        // Verify the token
        const decoded = jwt.verify(token, config.JWT_SECRET);

        // Try to find as admin first
        let admin = await Admin.findById(decoded.userId).select('-password');
        if (admin) {
            req.user = {
                userId: admin._id,
                email: admin.email,
                name: admin.name,
                role: admin.role,
                type: 'admin'
            };
            return next();
        }

        // Try to find as user
        let user = await User.findById(decoded.userId).select('-password').lean();
        if (user) {
            const effective = getEffectiveSubscription(user);
            req.user = {
                userId: user._id,
                email: user.email,
                name: user.name,
                subscriptionTier: effective.subscriptionTier,
                subscriptionStatus: effective.subscriptionStatus,
                isSubscribed: effective.isSubscribed,
                isActive: user.isActive !== false,
                type: 'user'
            };
            return next();
        }

        throw new ExpressError('Invalid token - user not found', 401);
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw new ExpressError('Invalid token', 401);
        } else if (error.name === 'TokenExpiredError') {
            throw new ExpressError('Token expired', 401);
        }
        next(error);
    }
};

// Middleware to check if user has valid subscription
const requireValidSubscription = (req, res, next) => {
    if (!req.user || req.user.type !== 'user') {
        throw new ExpressError('User authentication required', 401);
    }

    const validTiers = ['free', 'pro', 'elite'];
    if (!validTiers.includes(req.user.subscriptionTier)) {
        throw new ExpressError('Valid subscription required', 403);
    }

    next();
};

const requireActiveUser = (req, res, next) => {
    if (!req.user || req.user.type !== 'user') {
        throw new ExpressError('User authentication required', 401);
    }

    if (req.user.isActive === false) {
        const error = new ExpressError('Your account is inactive. Please contact support to reactivate.', 403);
        error.code = 'ACCOUNT_INACTIVE';
        throw error;
    }

    next();
};

// Middleware to check if user has premium subscription
const requirePremiumSubscription = (req, res, next) => {
    if (!req.user || req.user.type !== 'user') {
        throw new ExpressError('User authentication required', 401);
    }

    const premiumTiers = ['pro', 'elite'];
    if (!premiumTiers.includes(req.user.subscriptionTier)) {
        throw new ExpressError('Premium subscription required', 403);
    }

    next();
};

// OLD: Simple DB-only check — rejected immediately if subscriptionStatus !== 'active'.
// Caused "Failed to generate replies" right after purchase because the RevenueCat
// webhook hadn't updated the DB yet (race condition with new fast Chat Completions API).
// const requireActiveSubscription = (req, res, next) => {
//     if (!req.user || req.user.type !== 'user') {
//         throw new ExpressError('User authentication required', 401);
//     }
//     if (req.user.subscriptionStatus !== 'active') {
//         const error = new ExpressError('Your subscription is inactive. Please restore or renew to continue.', 403);
//         error.code = 'SUBSCRIPTION_INACTIVE';
//         throw error;
//     }
//     next();
// };

// NEW: Falls back to a direct RevenueCat API check before rejecting, so a freshly
// purchased subscription is recognised even if the webhook hasn't arrived yet.
const requireActiveSubscription = async (req, res, next) => {
    try {
        if (!req.user || req.user.type !== 'user') {
            throw new ExpressError('User authentication required', 401);
        }

        if (req.user.subscriptionStatus === 'active') {
            return next();
        }

        // DB says inactive — check RevenueCat directly to catch webhook race condition
        if (config.REVENUECAT_API_KEY) {
            try {
                const user = await User.findById(req.user.userId)
                    .select('subscriptionOriginalAppUserId revenueCatAliases')
                    .lean();
                const rcIds = [
                    user?.subscriptionOriginalAppUserId,
                    req.user.userId.toString(),
                    ...(user?.revenueCatAliases || []),
                ].filter(Boolean);

                let isActiveInRC = false;
                for (const rcId of rcIds) {
                    try {
                        const { data } = await axios.get(
                            `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcId)}`,
                            {
                                headers: { Authorization: `Bearer ${config.REVENUECAT_API_KEY}` },
                                timeout: 2000,
                            }
                        );
                        const entitlements = data?.subscriber?.entitlements || {};
                        const ent =
                            entitlements.pro ||
                            entitlements.Pro ||
                            Object.values(entitlements)[0];
                        if (ent?.expires_date && new Date(ent.expires_date) > new Date()) {
                            isActiveInRC = true;
                            break;
                        }
                    } catch {
                        // try next rcId
                    }
                }

                if (isActiveInRC) {
                    await User.findByIdAndUpdate(req.user.userId, {
                        subscriptionStatus: 'active',
                        isSubscribed: true,
                        subscriptionTier: 'pro',
                    });
                    return next();
                }
            } catch {
                // RC check failed — fall through to rejection
            }
        }

        const error = new ExpressError('Your subscription is inactive. Please restore or renew to continue.', 403);
        error.code = 'SUBSCRIPTION_INACTIVE';
        throw error;
    } catch (error) {
        next(error);
    }
};

module.exports = {
    authenticateToken,
    requireAdmin,
    authenticateUser,
    authenticateAny,
    requireValidSubscription,
    requireActiveUser,
    requirePremiumSubscription,
    requireActiveSubscription
};
