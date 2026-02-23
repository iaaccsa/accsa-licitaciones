from app.core.qdrant import qdrant_client
from app.schemas.qdrant import QdrantSearchRequest, QdrantSearchResponse, QdrantPoint, QdrantScrollRequest, QdrantScrollResponse
from qdrant_client.http import models

class QdrantService:
    def list_collections(self):
        return qdrant_client.get_collections()

    def search_points(self, search_params: QdrantSearchRequest) -> QdrantSearchResponse:
        results = qdrant_client.query_points(
            collection_name=search_params.collection_name,
            query=search_params.vector,
            query_filter=models.Filter(**search_params.filter) if search_params.filter else None,
            limit=search_params.limit,
            with_payload=search_params.with_payload
        )

        return QdrantSearchResponse(
            points=[
                QdrantPoint(
                    id=point.id,
                    score=point.score,
                    payload=point.payload
                ) for point in results.points
            ]
        )

    def scroll_points(self, scroll_params: QdrantScrollRequest) -> QdrantScrollResponse:
        must_filters = []
        if scroll_params.category:
            must_filters.append(
                models.FieldCondition(
                    key="category",
                    match=models.MatchValue(value=scroll_params.category)
                )
            )
        if scroll_params.label:
            must_filters.append(
                models.FieldCondition(
                    key="label",
                    match=models.MatchValue(value=scroll_params.label)
                )
            )
        
        query_filter = None
        if must_filters:
            query_filter = models.Filter(must=must_filters)

        # qdrant_client.scroll returns (points, next_page_offset)
        points, next_page_offset = qdrant_client.scroll(
            collection_name=scroll_params.slug,
            scroll_filter=query_filter,
            limit=scroll_params.limit,
            offset=scroll_params.offset,
            with_payload=True,
            with_vectors=False
        )

        return QdrantScrollResponse(
            points=[
                QdrantPoint(
                    id=point.id,
                    payload=point.payload
                ) for point in points
            ],
            next_page_offset=next_page_offset
        )

qdrant_service = QdrantService()
