from dataclasses import dataclass
from enum import Enum
from typing import Any, Protocol


class ChallengeRedis(Protocol):
    async def eval(self, script: str, numkeys: int, *keys_and_args: Any) -> Any: ...


class ChallengeOutcome(str, Enum):
    CONSUMED = 'consumed'
    INVALID = 'invalid'
    MISSING = 'missing'
    EXHAUSTED = 'exhausted'
    MALFORMED = 'malformed'


@dataclass(frozen=True)
class ChallengeResult:
    outcome: ChallengeOutcome
    attempts: int


class ChallengeBackendUnavailable(Exception):
    pass


class VerificationCodeStore:
    consume_script: str = """
local key = KEYS[1]
local raw = redis.call('GET', key)
if not raw then
    return {'missing', 0}
end
local ttl = redis.call('PTTL', key)
if ttl <= 0 then
    redis.call('DEL', key)
    return {'malformed', 0}
end
local decoded, data = pcall(cjson.decode, raw)
if not decoded or type(data) ~= 'table' or type(data.code) ~= 'string'
    or not string.match(data.code, '^%d%d%d%d%d%d$')
    or type(data.attempts) ~= 'number' or data.attempts < 0
    or data.attempts ~= math.floor(data.attempts) then
    redis.call('DEL', key)
    return {'malformed', 0}
end
if data.attempts >= 5 then
    redis.call('DEL', key)
    return {'exhausted', 5}
end
data.attempts = data.attempts + 1
if data.code == ARGV[1] then
    redis.call('DEL', key)
    return {'consumed', data.attempts}
end
if data.attempts == 5 then
    redis.call('DEL', key)
else
    redis.call('SET', key, cjson.encode(data), 'KEEPTTL')
end
return {'invalid', data.attempts}
"""

    def __init__(self, redis: ChallengeRedis) -> None:
        self.redis: ChallengeRedis = redis

    async def consume(self, key: str, supplied_code: str) -> ChallengeResult:
        try:
            raw: Any = await self.redis.eval(self.consume_script, 1, key, supplied_code)
            if not isinstance(raw, (list, tuple)) or len(raw) != 2:
                raise ValueError('Invalid challenge result')
            outcome: ChallengeOutcome = ChallengeOutcome(raw[0])
            attempts: Any = raw[1]
            if type(attempts) is not int or not 0 <= attempts <= 5:
                raise ValueError('Invalid challenge attempts')
            if (outcome == ChallengeOutcome.CONSUMED and attempts == 0) or (
                outcome == ChallengeOutcome.EXHAUSTED and attempts != 5
            ) or (outcome == ChallengeOutcome.INVALID and attempts == 0) or (
                outcome in (ChallengeOutcome.MISSING, ChallengeOutcome.MALFORMED) and attempts != 0
            ):
                raise ValueError('Inconsistent challenge result')
            return ChallengeResult(outcome=outcome, attempts=attempts)
        except Exception:
            raise ChallengeBackendUnavailable('Verification service unavailable') from None
