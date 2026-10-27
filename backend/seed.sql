-- FICTIONAL LOCAL TEST DATA ONLY. Never included by migrations or production startup.
-- Session secrets are generated separately by the local seed helper; none are checked in.
INSERT OR IGNORE INTO users(id,username,display_name,visibility,status,created_at) VALUES
 ('fixture-author','fixture_author','Fictional Requester','everyone','active',1700000000000),
 ('fixture-recipient','fixture_recipient','Fictional Recipient','private','active',1700000000000),
 ('fixture-member','fixture_member','Fictional Church Member','private','active',1700000000000),
 ('fixture-outsider','fixture_outsider','Fictional Visitor','everyone','active',1700000000000),
 ('fixture-pending','fixture_pending','Fictional Applicant','private','active',1700000000000),
 ('fixture-removed','fixture_removed','Fictional Former Member','private','active',1700000000000),
 ('fixture-late','fixture_late','Fictional Later Member','private','active',1700000000000),
 ('fixture-suspended','fixture_suspended','Fictional Suspended Account','private','suspended',1700000000000);
INSERT OR IGNORE INTO boxes(id,kind,owner_id,slug,display_name,visibility,status,authority_verified_at,created_at) VALUES
 ('fixture-personal','personal','fixture-recipient','fixture_recipient','Fictional Personal Box','private','active',NULL,1700000000000),
 ('fixture-author-box','personal','fixture-author','fixture_author','Fictional Author Box','private','active',NULL,1700000000000),
 ('fixture-public-box','personal','fixture-outsider','fixture_outsider','Fictional Public Box','everyone','active',NULL,1700000000000),
 ('fixture-organization','organization','fixture-recipient','fixture-church','Fictional Church','private','active',1700000000000,1700000000000),
 ('fixture-other-organization','organization','fixture-outsider','fixture-other-church','Other Fictional Church','private','active',1700000000000,1700000000000);
INSERT OR IGNORE INTO memberships(box_id,user_id,status,role,approved_by,approved_at,revoked_at,official_reply) VALUES
 ('fixture-organization','fixture-recipient','approved','owner','fixture-recipient',1700000000000,NULL,1),
 ('fixture-organization','fixture-member','approved','member','fixture-recipient',1700000000000,NULL,0),
 ('fixture-organization','fixture-pending','pending','member',NULL,NULL,NULL,0),
 ('fixture-organization','fixture-removed','revoked','member','fixture-recipient',1700000000000,1700000000500,0),
 ('fixture-organization','fixture-late','approved','member','fixture-recipient',1700000002000,NULL,0),
 ('fixture-other-organization','fixture-outsider','approved','owner','fixture-outsider',1700000000000,NULL,1);
INSERT OR IGNORE INTO authored_sources(id,author_id,created_at) VALUES
 ('fixture-source-private','fixture-author',1700000001000),
 ('fixture-source-public','fixture-author',1700000001000),
 ('fixture-source-held','fixture-author',1700000001000);
INSERT OR IGNORE INTO deliveries(id,source_id,box_id,audience,author_ceiling,box_ceiling,anonymous,status,
 history_policy,history_notice_version,group_block_policy,created_at) VALUES
 ('fixture-delivery-personal','fixture-source-private','fixture-personal','private','everyone','private',1,'approved','personal',NULL,NULL,1700000001000),
 ('fixture-delivery-organization','fixture-source-private','fixture-organization','private','everyone','private',1,'approved','retained','fixture-retained-v1','hold_on_conflict',1700000001000),
 ('fixture-delivery-at-delivery','fixture-source-private','fixture-organization','private','everyone','private',1,'approved','at_delivery','fixture-at-delivery-v1','hold_on_conflict',1700000001000),
 ('fixture-delivery-public','fixture-source-public','fixture-public-box','everyone','everyone','everyone',1,'approved','personal',NULL,NULL,1700000001000),
 ('fixture-delivery-pending','fixture-source-held','fixture-personal','private','everyone','private',1,'pending','personal',NULL,NULL,1700000001000);
INSERT OR IGNORE INTO posts(id,delivery_id,kind,title,body,status,created_at) VALUES
 ('fixture-personal-original','fixture-delivery-personal','request','A fictional new beginning','Synthetic local prayer text for permission testing.','approved',1700000001000),
 ('fixture-personal-update','fixture-delivery-personal','update','A fictional new beginning','Synthetic update, visible only in this personal delivery.','approved',1700000002000),
 ('fixture-organization-original','fixture-delivery-organization','request','A fictional church request','Synthetic separate church copy; no personal replies are copied.','approved',1700000001000),
 ('fixture-at-delivery-original','fixture-delivery-at-delivery','request','An earlier fictional request','Synthetic request with explicit membership-at-delivery history scope.','approved',1700000001000),
 ('fixture-public-original','fixture-delivery-public','request','A fictional public request','Synthetic anonymous public text.','approved',1700000001000),
 ('fixture-pending-original','fixture-delivery-pending','request','A held fictional request','Synthetic pending content must not be served.','pending',1700000001000),
 ('fixture-pending-update','fixture-delivery-personal','update','Held fictional update','Synthetic pending update must not be served.','pending',1700000003000);
INSERT OR IGNORE INTO replies(id,delivery_id,post_id,actor_id,identity_mode,body,status,created_at) VALUES
 ('fixture-personal-reply','fixture-delivery-personal','fixture-personal-original','fixture-recipient','personal','Synthetic encouragement on the original.','approved',1700000001500),
 ('fixture-update-reply','fixture-delivery-personal','fixture-personal-update','fixture-author','personal','Synthetic author reply must preserve request anonymity.','approved',1700000002500),
 ('fixture-held-reply','fixture-delivery-personal','fixture-personal-update','fixture-recipient','personal','Synthetic pending reply must stay hidden.','pending',1700000002600),
 ('fixture-organization-reply','fixture-delivery-organization','fixture-organization-original','fixture-recipient','organization','Synthetic official church encouragement.','approved',1700000001500);
INSERT OR IGNORE INTO acknowledgments(id,delivery_id,kind,template_version,body,created_at) VALUES
 ('fixture-private-ack','fixture-delivery-personal','platform','fixture-v1','Synthetic automatic receipt: only the requester may see it.',1700000001001);
