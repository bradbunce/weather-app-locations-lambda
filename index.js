// Only use dotenv in development
if (process.env.NODE_ENV === "development") {
  require("dotenv").config();
}

const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const jwt = require("jsonwebtoken");
const {
  addLocation,
  removeLocation,
  getUserLocations,
  updateLocationOrder,
} = require("./locationProcessor");

// Initialize API Gateway client for WebSocket
const apiGateway = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBSOCKET_API_ENDPOINT
});

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient();
const dynamo = DynamoDBDocumentClient.from(client);

const CONFIG = {
  CONNECTIONS_TABLE: 'brad-weather-app-websocket-connections'
};

const broadcastLocationUpdate = async (userId, locations) => {
  try {
    console.log('Broadcasting location update:', {
      userId,
      locationCount: locations.length
    });

    // Get all connections for this user
    const { Items } = await dynamo.send(new ScanCommand({
      TableName: CONFIG.CONNECTIONS_TABLE,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': String(userId)
      }
    }));

    if (!Items?.length) {
      console.log('No active connections for user:', userId);
      return;
    }

    // Send update to each connection
    const sendPromises = Items.map(connection => 
      apiGateway.send(new PostToConnectionCommand({
        Data: JSON.stringify({
          action: 'locationUpdate',
          locations
        }),
        ConnectionId: connection.connectionId
      }))
    );

    await Promise.all(sendPromises);
    console.log('Location update broadcast successful');
  } catch (error) {
    console.error('Failed to broadcast location update:', error);
  }
};

// Create response with CORS headers
const createResponse = (statusCode, body) => {
  const origin = process.env.REACT_APP_ALLOWED_ORIGIN || "*";

  console.log("CORS Configuration:", {
    allowedOrigin: origin
  });

  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
      "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-requested-with",
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    },
    body: JSON.stringify(body),
  };
};

const verifyToken = (authHeader) => {
  console.log("Full Authorization Header:", authHeader);
  console.log("Environment Variables:", {
    JWT_SECRET_EXISTS: !!process.env.JWT_SECRET,
    JWT_SECRET_LENGTH: process.env.JWT_SECRET
      ? process.env.JWT_SECRET.length
      : "N/A",
  });

  if (!authHeader) {
    console.log("No Authorization header provided");
    throw new Error("No token provided");
  }

  // Handle case-sensitivity and ensure proper Bearer format
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    console.log("Invalid Authorization header format");
    console.log("Attempted header:", authHeader);
    throw new Error("Invalid token format");
  }

  const token = tokenMatch[1];
  console.log("Extracted token (first 20 chars):", token.substring(0, 20));

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET environment variable NOT SET");
    throw new Error("Server configuration error: Missing JWT_SECRET");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Token decoded successfully:", {
      userId: decoded.userId,
      username: decoded.username,
    });
    return decoded;
  } catch (error) {
    console.error("Token verification FAILED:", {
      errorName: error.name,
      errorMessage: error.message,
    });
    throw error;
  }
};

exports.handler = async (event) => {
  // Enhanced logging for ALL events
  console.log(
    "FULL EVENT DETAILS:",
    JSON.stringify(
      {
        method: event.httpMethod,
        path: event.path,
        headers: event.headers,
        body: event.body,
        queryStringParameters: event.queryStringParameters,
      },
      null,
      2
    )
  );

  // Handle OPTIONS requests explicitly
  if (event.httpMethod === "OPTIONS") {
    console.log("Handling CORS Preflight Request");
    return createResponse(204, {});
  }

  try {
    // Verify JWT token with enhanced logging
    const user = verifyToken(event.headers.Authorization);
    console.log("Authenticated User:", {
      userId: user.userId,
      username: user.username,
    });

    const { path, httpMethod, body } = event;
    const requestBody = body ? JSON.parse(body) : {};

    console.log("Processing Request:", {
      method: httpMethod,
      path: path,
      userId: user.userId,
      username: user.username,
      requestBody,
    });

    // Check if this is a delete request for a specific location
    if (httpMethod === 'DELETE' && path.match(/^\/locations\/\d+$/)) {
      const locationId = path.split('/').pop();
      console.log("Processing delete request:", {
        path,
        locationId,
        userId: user.userId
      });
      
      try {
        await removeLocation(user.userId, locationId);
        const updatedLocations = await getUserLocations(user.userId);
        await broadcastLocationUpdate(user.userId, updatedLocations);
        return createResponse(200, { message: "Location deleted successfully" });
      } catch (err) {
        console.error("Delete operation failed:", {
          error: err.message,
          userId: user.userId,
          locationId
        });
        return createResponse(500, { message: "Failed to delete location" });
      }
    }

    // Handle other routes
    switch (`${httpMethod} ${path}`) {
      case "GET /locations":
        const locations = await getUserLocations(user.userId);
        return createResponse(200, locations);

      case "POST /locations":
        console.log("Attempting to add location:", requestBody);
        const newLocation = await addLocation(user.userId, requestBody);
        console.log("Location added successfully:", newLocation);
        const updatedLocations = await getUserLocations(user.userId);
        await broadcastLocationUpdate(user.userId, updatedLocations);
        return createResponse(201, newLocation);

      case "PUT /locations/order":
        await updateLocationOrder(user.userId, requestBody.locationOrder);
        return createResponse(200, {
          message: "Location order updated successfully",
        });

      default:
        console.log("No matching route found for:", `${httpMethod} ${path}`);
        return createResponse(404, { message: "Not Found" });
    }
  } catch (error) {
    console.error("DETAILED ERROR PROCESSING:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    if (
      error.message === "No token provided" ||
      error.message === "Invalid token format" ||
      error.name === "JsonWebTokenError"
    ) {
      return createResponse(401, {
        message: "Unauthorized: Invalid Token",
        details: error.message,
      });
    }

    if (error.name === "TokenExpiredError") {
      return createResponse(401, {
        message: "Token Expired",
      });
    }

    return createResponse(500, {
      message: "Internal Server Error",
      details: error.message,
    });
  }
};