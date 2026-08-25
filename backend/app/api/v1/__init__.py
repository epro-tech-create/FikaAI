"""API router aggregation."""

from fastapi import APIRouter

from app.api.v1 import auth, student_attendance, student_face

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(student_face.router)
api_router.include_router(student_attendance.router)
api_router.include_router(student_attendance.profile_router)
