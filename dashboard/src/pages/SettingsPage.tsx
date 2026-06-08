import { HiOutlineCog6Tooth } from 'react-icons/hi2';
import { useUserSettings } from '../hooks/useUserSettings';

interface SettingsPageProps {
  userId: string;
}

const FEATURE_ITEMS = [
  {
    key: 'messagingButtons',
    title: 'Messaging buttons',
    description: 'Show MyFeedIn buttons inside LinkedIn messaging conversations',
  },
  {
    key: 'postButtons',
    title: 'Post buttons',
    description: 'Show MyFeedIn buttons on LinkedIn feed posts',
  },
  {
    key: 'speechToComment',
    title: 'Speech to comment',
    description: 'Show floating mic button on LinkedIn for voice comments',
  },
] as const;

export default function SettingsPage({ userId }: SettingsPageProps) {
  const { settings, loading, savingKey, updateSetting } = useUserSettings(userId);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Manage account</h1>
          <p className="page-subtitle">Customize how MyFeedIn behaves inside LinkedIn.</p>
        </div>
      </div>

      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-icon">
            <HiOutlineCog6Tooth />
          </div>
          <div>
            <h2>Features</h2>
            <p>Turn MyFeedIn features on or off for your account.</p>
          </div>
        </div>

        <div className="settings-list">
          {FEATURE_ITEMS.map((item) => (
            <div className="settings-row" key={item.key}>
              <div className="settings-row-copy">
                <div className="settings-row-title">{item.title}</div>
                <div className="settings-row-description">{item.description}</div>
              </div>
              <button
                type="button"
                className={`settings-toggle${settings[item.key] ? ' active' : ''}`}
                disabled={loading || savingKey === item.key}
                onClick={() => void updateSetting(item.key, !settings[item.key])}
                aria-pressed={settings[item.key]}
                title={item.description}
              >
                <span className="settings-toggle-thumb" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
