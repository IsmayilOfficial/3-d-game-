/**
 * Reference Unity C# scripts corresponding directly to the 3D CharacterController
 * and environmental collision architecture running in this WebGL game.
 */
export const UNITY_CHARACTER_CONTROLLER_CS = `using UnityEngine;

[RequireComponent(typeof(CharacterController))]
public class PlayerCharacterController : MonoBehaviour
{
    [Header("Movement & Slopes")]
    public float walkSpeed = 13.5f;
    public float sprintSpeed = 18.2f;
    public float groundAccel = 68f;
    public float airAccel = 26f;
    public float gravity = -34f;

    [Header("Jump & Assist")]
    public float jumpSpeed = 13.8f;
    public float doubleJumpSpeed = 12.2f;
    public float coyoteTime = 0.12f;
    public float jumpBufferTime = 0.14f;

    [Header("Dash")]
    public float dashSpeed = 28f;
    public float dashDuration = 0.18f;
    public float dashCooldown = 1.15f;

    private CharacterController controller;
    private Vector3 velocity;
    private float coyoteTimer;
    private float jumpBufferTimer;
    private float dashTimer;
    private float dashCooldownTimer;
    private Vector3 dashDir;
    private bool canDoubleJump;

    void Awake()
    {
        controller = GetComponent<CharacterController>();
        controller.stepOffset = 0.5f;
        controller.slopeLimit = 45f;
    }

    void Update()
    {
        float dt = Mathf.Min(Time.deltaTime, 0.05f);
        bool grounded = controller.isGrounded;

        if (grounded)
        {
            coyoteTimer = coyoteTime;
            canDoubleJump = true;
            if (velocity.y < 0f) velocity.y = -2f;
        }
        else
        {
            coyoteTimer -= dt;
        }

        if (Input.GetButtonDown("Jump"))
            jumpBufferTimer = jumpBufferTime;
        else
            jumpBufferTimer -= dt;

        // Camera-relative horizontal input
        Vector2 raw = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
        Vector3 wishDir = (Camera.main.transform.right * raw.x + Camera.main.transform.forward * raw.y);
        wishDir.y = 0f;
        if (wishDir.sqrMagnitude > 1f) wishDir.Normalize();

        if (wishDir.sqrMagnitude > 0.01f)
        {
            Quaternion targetRot = Quaternion.LookRotation(wishDir);
            transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, 1f - Mathf.Exp(-16f * dt));
        }

        // Dash trigger
        dashCooldownTimer = Mathf.Max(0f, dashCooldownTimer - dt);
        if (Input.GetKeyDown(KeyCode.LeftShift) && dashCooldownTimer <= 0f)
        {
            dashTimer = dashDuration;
            dashCooldownTimer = dashCooldown;
            dashDir = wishDir.sqrMagnitude > 0.01f ? wishDir.normalized : transform.forward;
            velocity.y = Mathf.Max(velocity.y, 1.8f);
        }

        if (dashTimer > 0f)
        {
            dashTimer -= dt;
            velocity.x = dashDir.x * dashSpeed;
            velocity.z = dashDir.z * dashSpeed;
        }
        else
        {
            float targetSpeed = Input.GetKey(KeyCode.LeftControl) ? sprintSpeed : walkSpeed;
            float accel = grounded ? groundAccel : airAccel;
            Vector3 targetHoriz = wishDir * targetSpeed;
            Vector3 horiz = Vector3.MoveTowards(new Vector3(velocity.x, 0, velocity.z), targetHoriz, accel * dt);
            velocity.x = horiz.x;
            velocity.z = horiz.z;
        }

        // Jump with Coyote Time & Input Buffer
        if (jumpBufferTimer > 0f)
        {
            if (coyoteTimer > 0f)
            {
                velocity.y = jumpSpeed;
                coyoteTimer = 0f;
                jumpBufferTimer = 0f;
            }
            else if (canDoubleJump)
            {
                velocity.y = doubleJumpSpeed;
                canDoubleJump = false;
                jumpBufferTimer = 0f;
            }
        }

        if (dashTimer <= 0f)
            velocity.y += gravity * dt;

        controller.Move(velocity * dt);
    }
}`;

export const UNITY_COLLISION_HANDLER_CS = `using UnityEngine;

public class EnvironmentCollisionHandler : MonoBehaviour
{
    public float cratePushPower = 7.5f;
    public ParticleSystem impactSparks;
    private Transform activePlatform;
    private Vector3 lastPlatformPos;

    void OnControllerColliderHit(ControllerColliderHit hit)
    {
        // 1. Dynamic rigidbody crate pushing
        Rigidbody body = hit.collider.attachedRigidbody;
        if (body != null && !body.isKinematic && hit.moveDirection.y > -0.3f)
        {
            Vector3 pushDir = new Vector3(hit.moveDirection.x, 0f, hit.moveDirection.z);
            body.linearVelocity = pushDir * cratePushPower;
        }

        // 2. Wall-slide impact feedback
        if (Mathf.Abs(hit.normal.y) < 0.3f && hit.controller.velocity.magnitude > 4.2f)
        {
            if (impactSparks != null)
            {
                impactSparks.transform.position = hit.point;
                impactSparks.transform.rotation = Quaternion.LookRotation(hit.normal);
                impactSparks.Play();
            }
        }

        // 3. Moving platform carrier tracking
        if (hit.normal.y > 0.65f && hit.collider.CompareTag("MovingPlatform"))
        {
            if (activePlatform != hit.collider.transform)
            {
                activePlatform = hit.collider.transform;
                lastPlatformPos = activePlatform.position;
            }
        }
    }

    void LateUpdate()
    {
        if (activePlatform != null)
        {
            Vector3 delta = activePlatform.position - lastPlatformPos;
            GetComponent<CharacterController>().Move(delta);
            lastPlatformPos = activePlatform.position;
        }
    }
}`;
