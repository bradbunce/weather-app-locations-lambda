if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
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
    console.log('Verifying token from header:', authHeader);

    if (!authHeader) {
        console.log('No Authorization header provided');
        throw new Error('No token provided');
    }

    // Handle case-sensitivity and ensure proper Bearer format
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
        console.log('Invalid Authorization header format');
        throw new Error('Invalid token format');
    }

    const token = tokenMatch[1];
    console.log('Extracted token:', token.substring(0, 20) + '...');

    if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET environment variable not set');
        throw new Error('Server configuration error');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Token verified successfully for user:', decoded.username);
        return decoded;
    } catch (error) {
        console.error('Token verification failed:', error.message);
        throw error;
    }
};

exports.handler = async (event) => {
    console.log('Received event:', {
        method: event.httpMethod,
        path: event.path,
        headers: {
            ...event.headers,
            Authorization: event.headers.Authorization ? 
                event.headers.Authorization.substring(0, 20) + '...' : 
                undefined
        }
    });

    // Handle OPTIONS requests for CORS
    if (event.httpMethod === 'OPTIONS') {
        return createResponse(204, {});
    }

    try {
        // Verify JWT token
        const user = verifyToken(event.headers.Authorization);

        const { path, httpMethod, body } = event;
        const requestBody = body ? JSON.parse(body) : {};

        console.log('Processing request:', {
            method: httpMethod,
            path: path,
            userId: user.userId,
            username: user.username
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
        console.error('Request processing error:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });

        if (error.message === 'No token provided' || 
            error.message === 'Invalid token format' || 
            error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Unauthorized' });
        }

        if (error.name === 'TokenExpiredError') {
            return createResponse(401, { message: 'Token expired' });
        }

        return createResponse(500, { message: 'Internal server error' });
    }
};