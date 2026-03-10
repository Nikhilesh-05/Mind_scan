"""Chat API routes with keyword-based sentiment analysis."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.session import Session
from app.models.chat_result import ChatResult
from app.schemas.schemas import ChatMessageRequest, ChatMessageResponse, ChatHistoryResponse
from app.services.auth_service import get_current_user

router = APIRouter()

# ─── Keyword dictionaries for sentiment analysis ───
NEGATIVE_KEYWORDS = [
    "sad", "depressed", "unhappy", "down", "miserable", "hopeless", "tired",
    "lonely", "anxious", "worried", "stress", "stressed", "nervous", "angry",
    "frustrated", "frustrating", "bad", "terrible", "horrible", "awful",
    "crying", "cry", "pain", "suffering", "lost", "empty", "numb",
    "hate", "worthless", "useless", "scared", "afraid", "panic",
    "not feeling good", "not good", "not okay", "not ok", "not fine",
    "not happy", "can't sleep", "can't eat", "no motivation", "no energy",
    "don't want to", "give up", "suicidal", "self harm", "hurt myself",
    "kill myself", "end it all", "insomnia", "exhausted", "fatigue",
    "overwhelmed", "drowning", "stuck", "trapped", "broken",
]

POSITIVE_KEYWORDS = [
    "happy", "great", "good", "better", "wonderful", "amazing", "thankful",
    "grateful", "excited", "joy", "love", "positive", "fantastic", "excellent",
    "cheerful", "blessed", "motivated", "energetic", "confident", "calm",
    "peaceful", "hopeful", "optimistic", "proud", "relieved",
]

NEGATION_WORDS = ["not", "don't", "doesn't", "isn't", "aren't", "can't", "won't", "never", "no", "hardly"]

# ─── PHQ-9 signal keywords ───
PHQ9_KEYWORDS = {
    "hopelessness": ["hopeless", "no hope", "pointless", "no point", "why bother", "give up", "lost cause"],
    "fatigue": ["tired", "exhausted", "no energy", "fatigue", "drained", "worn out", "can't get up"],
    "anhedonia": ["don't enjoy", "no interest", "bored", "nothing matters", "don't care", "lost interest"],
    "sleep_issues": ["can't sleep", "insomnia", "sleep too much", "nightmares", "waking up", "awake all night"],
    "appetite_changes": ["can't eat", "not eating", "eating too much", "no appetite", "lost appetite", "binge"],
    "concentration": ["can't focus", "can't concentrate", "distracted", "brain fog", "forgetful"],
    "self_harm": ["hurt myself", "self harm", "suicidal", "kill myself", "end it", "don't want to live"],
}


def _analyze_sentiment(text: str) -> dict:
    """Analyze sentiment from text using keyword matching with negation awareness."""
    lower = text.lower().strip()

    neg_score = 0.0
    pos_score = 0.0
    neu_score = 0.3  # base neutral

    # Check for negation + positive (e.g., "not feeling good" = negative)
    has_negation = any(neg in lower for neg in NEGATION_WORDS)

    # Count keyword matches
    for kw in NEGATIVE_KEYWORDS:
        if kw in lower:
            neg_score += 0.25

    for kw in POSITIVE_KEYWORDS:
        if kw in lower:
            # If negation present with positive word, it's actually negative
            if has_negation:
                neg_score += 0.2
            else:
                pos_score += 0.25

    # If no keywords found, lean neutral
    if neg_score == 0 and pos_score == 0:
        return {"positive": 0.15, "neutral": 0.70, "negative": 0.15}

    # Normalize scores
    total = neg_score + pos_score + neu_score
    return {
        "positive": round(min(pos_score / total, 0.95), 2),  # type: ignore
        "neutral": round(min(neu_score / total, 0.95), 2),  # type: ignore
        "negative": round(min(neg_score / total, 0.95), 2),  # type: ignore
    }


def _detect_phq9(text: str) -> dict:
    """Detect PHQ-9 depression indicators from text."""
    lower = text.lower()
    signals = {}
    for category, keywords in PHQ9_KEYWORDS.items():
        score = 0.0
        for kw in keywords:
            if kw in lower:
                score += 0.3
        signals[category] = round(min(score, 1.0), 2)  # type: ignore
    return signals


def _get_mock_reply(user_message: str, sentiment: dict) -> str:
    """Generate an empathetic therapeutic reply based on analyzed sentiment."""
    lower = user_message.lower()
    neg = sentiment.get("negative", 0)
    pos = sentiment.get("positive", 0)

    # Check for crisis keywords first
    crisis_words = ["suicidal", "kill myself", "end it all", "self harm", "hurt myself", "don't want to live"]
    if any(w in lower for w in crisis_words):
        return ("I'm really concerned about what you've shared. Your feelings are valid, and you deserve support. "
                "Please reach out to a crisis helpline immediately — in India, call iCall at 9152987821 or "
                "Vandrevala Foundation at 1860-2662-345. You are not alone.")

    # Negative sentiment responses
    if neg > 0.4:
        if any(w in lower for w in ["not feeling good", "not good", "not okay", "not ok", "not fine"]):
            return ("I'm sorry to hear you're not feeling good. It takes strength to acknowledge that. "
                    "Can you tell me more about what's been bothering you? I'm here to listen.")
        elif any(w in lower for w in ["sad", "depressed", "unhappy", "down", "miserable"]):
            return ("I hear that you're feeling down. It takes courage to share that. "
                    "Can you tell me more about when these feelings started and how long they've been lasting?")
        elif any(w in lower for w in ["anxious", "worried", "stress", "nervous", "overwhelmed"]):
            return ("Anxiety can be really overwhelming. Let's explore what's been triggering these feelings. "
                    "What situations make you feel most anxious or stressed?")
        elif any(w in lower for w in ["tired", "exhausted", "fatigue", "no energy"]):
            return ("Fatigue and low energy can significantly affect how we feel. "
                    "How long have you been experiencing this tiredness? Has your sleep been affected?")
        elif any(w in lower for w in ["lonely", "alone", "isolated"]):
            return ("Feeling lonely is really painful, and I want you to know you're not alone right now. "
                    "Have you been able to connect with friends or family recently?")
        elif any(w in lower for w in ["angry", "frustrated", "frustrating"]):
            return ("It sounds like you're dealing with a lot of frustration. That's completely understandable. "
                    "What has been causing these feelings of frustration?")
        else:
            return ("I can sense you're going through a difficult time. Thank you for opening up to me. "
                    "Could you share more about what's been weighing on your mind?")

    # Positive sentiment responses
    if pos > 0.3:
        return ("That's wonderful to hear! It's great that you're experiencing positive emotions. "
                "What do you think has been contributing to feeling this way?")

    # Neutral / general
    return ("Thank you for sharing that with me. I'm here to listen and support you without judgment. "
            "Could you tell me a bit more about how this has been affecting your daily life?")


# ─── Cumulative sentiment tracking ───
def _compute_cumulative_sentiment(messages: list) -> dict:
    """Compute overall sentiment from all user messages in the conversation."""
    all_pos = []
    all_neg = []
    all_neu = []

    for msg in messages:
        if msg.get("role") == "user":
            s = _analyze_sentiment(msg["content"])
            all_pos.append(s["positive"])
            all_neg.append(s["negative"])
            all_neu.append(s["neutral"])

    if not all_pos:
        return {"positive": 0.15, "neutral": 0.70, "negative": 0.15}

    return {
        "positive": round(sum(all_pos) / len(all_pos), 2),  # type: ignore
        "neutral": round(sum(all_neu) / len(all_neu), 2),  # type: ignore
        "negative": round(sum(all_neg) / len(all_neg), 2),  # type: ignore
    }


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(
    data: ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        # Verify the session belongs to the user
        result = await db.execute(
            select(Session).where(Session.id == data.session_id, Session.user_id == current_user.id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get or create chat result
        result = await db.execute(select(ChatResult).where(ChatResult.session_id == data.session_id))
        chat_result = result.scalar_one_or_none()

        if not chat_result:
            chat_result = ChatResult(session_id=data.session_id, conversation_json={"messages": []})
            db.add(chat_result)

        # Add user message
        messages = list(chat_result.conversation_json.get("messages", []))
        messages.append({"role": "user", "content": data.message})

        # Analyze sentiment from THIS message
        current_sentiment = _analyze_sentiment(data.message)
        phq9 = _detect_phq9(data.message)

        # Generate empathetic bot reply based on actual sentiment
        bot_reply = _get_mock_reply(data.message, current_sentiment)
        messages.append({"role": "assistant", "content": bot_reply})

        # Compute cumulative sentiment across ALL user messages
        cumulative_sentiment = _compute_cumulative_sentiment(messages)

        # Accumulate PHQ-9 signals across conversation
        existing_phq9 = dict(chat_result.phq9_signals or {})
        for k, v in phq9.items():
            existing_phq9[k] = round(max(existing_phq9.get(k, 0), v), 2)  # type: ignore

        # Update chat result — assign NEW dicts so SQLAlchemy detects changes
        chat_result.conversation_json = {"messages": messages}
        chat_result.sentiment_scores = cumulative_sentiment
        chat_result.phq9_signals = existing_phq9

        await db.flush()

        return ChatMessageResponse(
            bot_reply=bot_reply,
            sentiment=cumulative_sentiment,
            phq9_signals=existing_phq9,
            conversation_length=len(messages),
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] send_message: {e}")
        raise HTTPException(status_code=500, detail="Failed to process message")


@router.get("/session/{session_id}", response_model=ChatHistoryResponse)
async def get_chat_history(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Session not found")

        result = await db.execute(select(ChatResult).where(ChatResult.session_id == session_id))
        chat_result = result.scalar_one_or_none()

        if not chat_result:
            return ChatHistoryResponse(session_id=session_id, messages=[], sentiment_scores={}, phq9_signals={})

        return ChatHistoryResponse(
            session_id=session_id,
            messages=chat_result.conversation_json.get("messages", []),
            sentiment_scores=chat_result.sentiment_scores or {},
            phq9_signals=chat_result.phq9_signals or {},
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] get_chat_history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve chat history")
