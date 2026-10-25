import { useState } from "react";
import type { PrayerRequest } from "../domain";
import { Icon, Modal } from "../ui";

const boxes = {
  maria: "Maria’s Prayer Box",
  grace: "Grace Church’s Prayer Box",
  mine: "Elena’s Prayer Box",
};

export default function DeleteRequests({
  requests,
  onClose,
  onDelete,
}: {
  requests: PrayerRequest[];
  onClose: () => void;
  onDelete: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const ids = requests.map((request) => request.id);
  const selectedRequests = requests.filter((request) =>
    selected.includes(request.id),
  );
  const sources = [...new Set(requests.map((request) => request.sourceId))];
  return (
    <Modal
      title={
        reviewing
          ? "Review what you’re deleting"
          : "Delete your prayer requests"
      }
      onClose={onClose}
      wide
    >
      <p>
        Choose the prayer boxes you want to remove your words from, or select
        all of your deliveries. Each selected delivery includes its original
        request, linked updates, testimonies and conversation.
      </p>
      {!reviewing ? (
        <>
          <label className="check-row delete-select-all">
            <input
              type="checkbox"
              checked={
                ids.length > 0 && ids.every((id) => selected.includes(id))
              }
              onChange={(event) => setSelected(event.target.checked ? ids : [])}
            />
            <span>
              <strong>Select all deliveries shown</strong>
              <small>Remove these requests from every listed prayer box.</small>
            </span>
          </label>
          <div className="delete-request-groups">
            {sources.map((source) => {
              const copies = requests.filter(
                (request) => request.sourceId === source,
              );
              return (
                <fieldset className="destination-fieldset" key={source}>
                  <legend>{copies[0].topic}</legend>
                  {copies.map((request) => (
                    <label className="check-row" key={request.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(request.id)}
                        onChange={(event) =>
                          setSelected((previous) =>
                            event.target.checked
                              ? [...previous, request.id]
                              : previous.filter((id) => id !== request.id),
                          )
                        }
                      />
                      <span>
                        <strong>{boxes[request.recipient]}</strong>
                        <small>
                          {request.anonymous
                            ? "Anonymous delivery"
                            : "Name shown"}{" "}
                          · this box’s conversation only
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="notice butter">
            <Icon name="info" />
            <p>
              These deliveries will disappear from their boxes, your My Requests
              list and their direct story links in this demo. Unselected
              deliveries stay separate. Copies already saved by another person
              cannot be recalled.
            </p>
          </div>
          <ul className="delete-review-list">
            {selectedRequests.map((request) => (
              <li key={request.id}>
                <strong>{request.topic}</strong>
                <span>{boxes[request.recipient]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="quiet-copy">
        Fictional browser state only. Resetting or reloading this prototype
        restores its examples.
      </p>
      <div className="modal-actions">
        <button
          className="button secondary"
          onClick={() => (reviewing ? setReviewing(false) : onClose())}
        >
          {reviewing ? "Back to selection" : "Cancel"}
        </button>
        <button
          className={`button ${reviewing ? "delete-confirm" : ""}`}
          disabled={!selectedRequests.length}
          onClick={() =>
            reviewing
              ? onDelete(selectedRequests.map((request) => request.id))
              : setReviewing(true)
          }
        >
          {reviewing ? "Delete selected deliveries" : "Review deletion"}
        </button>
      </div>
    </Modal>
  );
}
