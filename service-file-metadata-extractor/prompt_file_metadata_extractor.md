You are a data extractor specialized in public procurement documents.
Extract metadata from this document. Return a JSON object with these fields (null if not found):

- document_type: classify as one of:
  - "pliego": tender terms, specifications, or conditions issued by the contracting entity
  - "propuesta": bid or proposal submitted by a vendor/bidder
  - "normativa": laws, regulations, or legal standards referenced in the process
  - "otro": documents that don't fit the above categories
- company_name: name of the company or entity that authored or is primarily associated with this document
- company_role: classify as one of:
  - "licitante": the contracting entity calling for bids
  - "oferente": a bidder or vendor submitting a proposal
  - "regulador": a regulatory or oversight body
  - "otro": if the role doesn't fit the above
- document_purpose: 1-2 sentence description of the document's objective
- key_identifiers:
  - tax_id: fiscal/tax identifier (RUT, CUIT, NIT, RFC, or equivalent), null if not found
  - contract_number: tender, contract, or procurement reference number, null if not found
  - representative_name: legal representative or signatory name, null if not found
- summary: 2-3 sentence summary of the document content

Preserve all values in their original language as they appear in the document.

DOCUMENT TEXT:
{text}
