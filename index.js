// Only use dotenv in development
if (process.env.NODE_ENV === "development") {
    require("dotenv").config();
  }

const jwt = require('jsonwebtoken');
const {
    addLocation,
    removeLocation,
    getUserLocations,
    updateLocationOrder
} = require('./locationProcessor');

// Create response with CORS headers
const createResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.REACT_APP_ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Credentials': 'true'
    },
    body: JSON.stringify(body)
});

const verifyToken = (authHeader) => {
    console.log('Full Authorization Header:', authHeader);
    console.log('Environment Variables:', {
        JWT_SECRET_EXISTS: !!process.env.JWT_SECRET,
        JWT_SECRET_LENGTH: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 'N/A'
    });

    if (!authHeader) {
        console.log('No Authorization header provided');
        throw new Error('No token provided');
    }

    // Handle case-sensitivity and ensure proper Bearer format
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
        console.log('Invalid Authorization header format');
        console.log('Attempted header:', authHeader);
        throw new Error('Invalid token format');
    }

    const token = tokenMatch[1];
    console.log('Extracted token (first 20 chars):', token.substring(0, 20));

    if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET environment variable NOT SET');
        throw new Error('Server configuration error: Missing JWT_SECRET');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Token decoded successfully:', {
            userId: decoded.userId,
            username: decoded.username
        });
        return decoded;
    } catch (error) {
        console.error('Token verification FAILED:', {
            errorName: error.name,
            errorMessage: error.message
        });
        throw error;
    }
};

exports.handler = async (event) => {
    console.log('Full Event Details:', JSON.stringify({
        method: event.httpMethod,
        path: event.path,
        headers: {
            ...event.headers,
            Authorization: event.headers.Authorization 
                ? event.headers.Authorization.substring(0, 20) + '...' 
                : undefined
        },
        body: event.body
    }, null, 2));

    // Handle OPTIONS requests for CORS
    if (event.httpMethod === 'OPTIONS') {
        return createResponse(204, {});
    }

    try {
        // Verify JWT token with enhanced logging
        const user = verifyToken(event.headers.Authorization);
        console.log('Authenticated User:', {
            userId: user.userId,
            username: user.username
        });

        const { path, httpMethod, body } = event;
        const requestBody = body ? JSON.parse(body) : {};

        console.log('Processing Request:', {
            method: httpMethod,
            path: path,
            userId: user.userId,
            username: user.username,
            requestBody
        });

        switch (`${httpMethod} ${path}`) {
            case 'GET /locations':
                const locations = await getUserLocations(user.userId);
                return createResponse(200, locations);

            case 'POST /locations':
                const newLocation = await addLocation(user.userId, requestBody);
                return createResponse(201, newLocation);

            case 'DELETE /locations/{id}':
                const locationId = event.pathParameters.id;
                await removeLocation(user.userId, locationId);
                return createResponse(200, { message: 'Location deleted successfully' });

            case 'PUT /locations/order':
                await updateLocationOrder(user.userId, requestBody.locationOrder);
                return createResponse(200, { message: 'Location order updated successfully' });

            default:
                console.log('No matching route found for:', `${httpMethod} ${path}`);
                return createResponse(404, { message: 'Not Found' });
        }
    } catch (error) {
        console.error('Detailed Error Processing:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });

        // Detailed error responses
        if (error.message === 'No token provided' || 
            error.message === 'Invalid token format' || 
            error.name === 'JsonWebTokenError') {
            return createResponse(401, { 
                message: 'Unauthorized: Invalid Token', 
                details: error.message 
            });
        }

        if (error.name === 'TokenExpiredError') {
            return createResponse(401, { 
                message: 'Token Expired' 
            });
        }

        return createResponse(500, { 
            message: 'Internal Server Error', 
            details: error.message 
        });
    }
};