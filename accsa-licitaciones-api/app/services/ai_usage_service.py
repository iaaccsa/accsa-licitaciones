from uuid import UUID

from app.repositories.ai_usage_repository import ai_usage_repository
from app.schemas.ai_usage import AiUsage, AiUsageCreate, AiUsageCostSummary


class AiUsageService:
    def __init__(self):
        self.repository = ai_usage_repository

    def create(self, usage: AiUsageCreate) -> AiUsage:
        data = self.repository.create(usage.model_dump(mode="json"))
        return AiUsage(**data)

    def cost_summary(self, analysis_id: UUID) -> AiUsageCostSummary:
        rows = self.repository.get_by_analysis_id(str(analysis_id))
        total = 0.0
        by_proposal: dict = {}
        by_provider: dict = {}
        by_model: dict = {}
        currency = "USD"
        for r in rows:
            cost = float(r.get("cost_usd") or 0)
            total += cost
            currency = r.get("currency") or currency

            pid = r.get("proposal_id")
            p = by_proposal.setdefault(pid, {"proposal_id": pid, "cost": 0.0, "calls": 0})
            p["cost"] += cost
            p["calls"] += 1

            prov = r.get("provider")
            pr = by_provider.setdefault(prov, {"provider": prov, "cost": 0.0, "calls": 0})
            pr["cost"] += cost
            pr["calls"] += 1

            key = (r.get("provider"), r.get("model"), r.get("operation"))
            m = by_model.setdefault(
                key,
                {"provider": key[0], "model": key[1], "operation": key[2], "cost": 0.0, "calls": 0},
            )
            m["cost"] += cost
            m["calls"] += 1

        return AiUsageCostSummary(
            analysis_id=analysis_id,
            currency=currency,
            total_cost=total,
            total_calls=len(rows),
            by_proposal=sorted(by_proposal.values(), key=lambda x: -x["cost"]),
            by_provider=sorted(by_provider.values(), key=lambda x: -x["cost"]),
            by_model=sorted(by_model.values(), key=lambda x: -x["cost"]),
        )


ai_usage_service = AiUsageService()
