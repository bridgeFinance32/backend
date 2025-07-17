import { JwtPayload } from "jsonwebtoken";
export enum HTTP_STATUS {
    SUCCESS = 200,
    CREATED = 201,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    CONFLICT = 409,
    SERVER_ERROR = 500
}

export interface UserData {
    id: unknown;
    email: string;
    username: string;
    password?: string;
}
export interface AuthenticatedRequest extends Request {
  user?: string | JwtPayload;
  id: string | JwtPayload
}

export interface AuthResponse {
    user: UserData;
}

export interface ErrorResponse {
    message: string;
}

export interface APIResponse<T> {
    success: boolean;
    message?: string;
    data?: T;
    error?: ErrorResponse;
}