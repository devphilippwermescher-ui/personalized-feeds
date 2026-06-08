import { HiOutlineTrash } from 'react-icons/hi2';
import type { FeedMember } from 'shared/types';

interface MemberRowProps {
  member: FeedMember;
  onRemove: (memberId: string) => void;
}

export default function MemberRow({ member, onRemove }: MemberRowProps) {
  return (
    <tr className="member-row">
      <td>
        <div className="member-identity">
          {member.profileImageUrl ? (
            <img src={member.profileImageUrl} alt="" className="member-avatar" />
          ) : (
            <div className="member-avatar-placeholder">
              {member.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="member-name-group">
            <a
              href={member.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="member-name"
            >
              {member.displayName}
            </a>
            <span className="member-username">@{member.linkedinUsername}</span>
          </div>
        </div>
      </td>
      <td className="member-headline">{member.headline || '-'}</td>
      <td>{member.company || '-'}</td>
      <td>{member.location || '-'}</td>
      <td>{member.connectionDegree || '-'}</td>
      <td>
        <span className="member-date">
          {new Date(member.addedAt).toLocaleDateString()}
        </span>
      </td>
      <td>
        <button
          className="member-remove-btn"
          onClick={() => {
            if (confirm(`Remove ${member.displayName} from this feed?`)) {
              onRemove(member.id);
            }
          }}
          title="Remove from feed"
        >
          <HiOutlineTrash />
        </button>
      </td>
    </tr>
  );
}
